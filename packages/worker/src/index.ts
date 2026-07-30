import {
  CONTRACT_VERSION,
  normalizedEventSchema,
  signedJobEnvelopeSchema,
  workerHeartbeatSchema,
  workerManifestSchema,
  workerRegistrationSchema,
  workerResourceSnapshotSchema,
  type NormalizedEvent,
  type SignedJobEnvelope,
  type WorkerHeartbeat,
  type WorkerManifest,
  type WorkerMode,
  type WorkerRegistration,
  type WorkerResourceSnapshot,
} from "@agent-ops/contracts";
import {
  evaluateWorkerPreflight,
  type WorkerPreflightRejectionReason,
} from "@agent-ops/domain";

export type WorkerRuntimeLimits = {
  readonly minimumFreeDiskBytes: number;
  readonly maximumActiveWorktrees: number;
  readonly maximumRunningJobs: number;
  readonly maximumRuntimeSeconds: number;
};

export type WorkerRuntimeConfiguration = {
  readonly registrationId: string;
  readonly bootId: string;
  readonly manifest: WorkerManifest;
  readonly limits: WorkerRuntimeLimits;
};

export interface WorkerClock {
  now(): string;
}

export interface WorkerResourceInspector {
  inspect(): Promise<WorkerResourceSnapshot>;
}

export interface WorkerEnvelopeVerifier {
  verifySignature(envelope: SignedJobEnvelope): Promise<boolean>;
  verifyPolicy(envelope: SignedJobEnvelope): Promise<boolean>;
}

export interface WorkerPathScope {
  isAllowed(path: string): Promise<boolean>;
}

export interface WorkerSkillCompatibility {
  satisfies(installedVersion: string, requiredRange: string): boolean;
}

export interface WorkerControlPlane {
  register(registration: WorkerRegistration): Promise<void>;
  heartbeat(heartbeat: WorkerHeartbeat): Promise<void>;
  recordEvent(event: NormalizedEvent): Promise<void>;
}

export type WorkerRuntimePorts = {
  readonly clock: WorkerClock;
  readonly resources: WorkerResourceInspector;
  readonly verifier: WorkerEnvelopeVerifier;
  readonly pathScope: WorkerPathScope;
  readonly skills: WorkerSkillCompatibility;
  readonly controlPlane: WorkerControlPlane;
};

export type WorkerAdmissionRejectionReason =
  | "supervisor-not-started"
  | "invalid-envelope"
  | WorkerPreflightRejectionReason;

export type WorkerAdmissionResult =
  | {
    readonly accepted: true;
    readonly jobId: string;
    readonly duplicate: boolean;
  }
  | {
    readonly accepted: false;
    readonly reasons: readonly WorkerAdmissionRejectionReason[];
  };

export type WorkerCancellationResult =
  | { readonly cancelled: true; readonly jobId: string }
  | {
    readonly cancelled: false;
    readonly jobId: string;
    readonly reason: "supervisor-not-started" | "not-found" | "already-terminal";
  };

export type WorkerInspection = {
  readonly started: boolean;
  readonly mode: "stopped" | WorkerMode;
  readonly activeJobIds: readonly string[];
};

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const entries = Object.entries(value as Readonly<Record<string, unknown>>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
};

export class WorkerSupervisor {
  readonly #configuration: WorkerRuntimeConfiguration;
  readonly #ports: WorkerRuntimePorts;
  readonly #activeJobs = new Set<string>();
  readonly #admittedEnvelopes = new Map<string, {
    readonly identity: string;
    readonly envelope: SignedJobEnvelope;
  }>();
  #started = false;
  #eventSequence = 0;
  #heartbeatSequence = 0;
  #operationTail: Promise<void> = Promise.resolve();

  constructor(
    configuration: WorkerRuntimeConfiguration,
    ports: WorkerRuntimePorts,
  ) {
    const limits = configuration.limits;
    if (
      !Number.isSafeInteger(limits.minimumFreeDiskBytes)
      || limits.minimumFreeDiskBytes < 0
      || !Number.isSafeInteger(limits.maximumActiveWorktrees)
      || limits.maximumActiveWorktrees < 0
      || !Number.isSafeInteger(limits.maximumRunningJobs)
      || limits.maximumRunningJobs <= 0
      || !Number.isSafeInteger(limits.maximumRuntimeSeconds)
      || limits.maximumRuntimeSeconds <= 0
    ) {
      throw new Error("Worker runtime limits must be bounded non-negative safe integers.");
    }
    this.#configuration = {
      ...configuration,
      manifest: workerManifestSchema.parse(configuration.manifest),
    };
    this.#ports = ports;
  }

  #mode(): WorkerMode {
    return this.#activeJobs.size ? "busy" : "idle";
  }

  async #inspectResources(): Promise<WorkerResourceSnapshot> {
    return workerResourceSnapshotSchema.parse(
      await this.#ports.resources.inspect(),
    );
  }

  #applyReservations(resources: WorkerResourceSnapshot): WorkerResourceSnapshot {
    let reservedMemoryBytes = 0;
    let reservedWorktreeSlots = 0;
    for (const jobId of this.#activeJobs) {
      const budget = this.#admittedEnvelopes.get(jobId)?.envelope.resourceBudget;
      if (!budget) continue;
      reservedMemoryBytes += budget.memoryReservationBytes;
      reservedWorktreeSlots += budget.worktreeSlots;
    }
    return {
      freeDiskBytes: resources.freeDiskBytes,
      availableMemoryBytes: Math.max(
        0,
        resources.availableMemoryBytes - reservedMemoryBytes,
      ),
      activeWorktreeCount: resources.activeWorktreeCount + reservedWorktreeSlots,
      runningJobCount: Math.max(resources.runningJobCount, this.#activeJobs.size),
    };
  }

  inspect(): WorkerInspection {
    return {
      started: this.#started,
      mode: this.#started ? this.#mode() : "stopped",
      activeJobIds: [...this.#activeJobs].sort(),
    };
  }

  #runExclusive<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#operationTail.then(operation, operation);
    this.#operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  start(): Promise<WorkerInspection> {
    return this.#runExclusive(() => this.#start());
  }

  async #start(): Promise<WorkerInspection> {
    if (this.#started) {
      await this.#heartbeat();
      return this.inspect();
    }

    const occurredAt = this.#ports.clock.now();
    const resources = await this.#inspectResources();
    const registration = workerRegistrationSchema.parse({
      version: CONTRACT_VERSION,
      registrationId: this.#configuration.registrationId,
      bootId: this.#configuration.bootId,
      manifest: this.#configuration.manifest,
      resources,
      mode: "idle",
      automaticResume: false,
      occurredAt,
    });
    await this.#ports.controlPlane.register(registration);
    this.#started = true;
    try {
      await this.#recordEvent({
        type: "worker.booted",
        entityType: "worker",
        entityId: this.#configuration.manifest.workerId,
        sourceEventId: `${this.#configuration.bootId}:worker.booted`,
        payload: {
          bootId: this.#configuration.bootId,
          automaticResume: false,
          recoveredJobCount: 0,
        },
      });
      await this.#heartbeat();
    } catch (error) {
      this.#started = false;
      throw error;
    }
    return this.inspect();
  }

  heartbeat(): Promise<WorkerHeartbeat> {
    return this.#runExclusive(() => this.#heartbeat());
  }

  async #heartbeat(): Promise<WorkerHeartbeat> {
    if (!this.#started) {
      throw new Error("Worker supervisor must start before sending a heartbeat.");
    }
    const heartbeat = workerHeartbeatSchema.parse({
      version: CONTRACT_VERSION,
      workerId: this.#configuration.manifest.workerId,
      bootId: this.#configuration.bootId,
      sequence: this.#heartbeatSequence,
      mode: this.#mode(),
      activeJobIds: [...this.#activeJobs].sort(),
      resources: this.#applyReservations(await this.#inspectResources()),
      occurredAt: this.#ports.clock.now(),
    });
    await this.#ports.controlPlane.heartbeat(heartbeat);
    await this.#recordEvent({
      type: "worker.health",
      entityType: "worker",
      entityId: this.#configuration.manifest.workerId,
      sourceEventId:
        `${this.#configuration.bootId}:worker.heartbeat:${heartbeat.sequence}`,
      payload: {
        heartbeatSequence: heartbeat.sequence,
        mode: heartbeat.mode,
        activeJobCount: heartbeat.activeJobIds.length,
        resources: heartbeat.resources,
      },
    });
    this.#heartbeatSequence += 1;
    return heartbeat;
  }

  admit(rawEnvelope: unknown): Promise<WorkerAdmissionResult> {
    return this.#runExclusive(() => this.#admit(rawEnvelope));
  }

  async #admit(rawEnvelope: unknown): Promise<WorkerAdmissionResult> {
    if (!this.#started) {
      return { accepted: false, reasons: ["supervisor-not-started"] };
    }
    const parsed = signedJobEnvelopeSchema.safeParse(rawEnvelope);
    if (!parsed.success) {
      await this.#recordEvent({
        type: "worker.job-rejected",
        entityType: "worker",
        entityId: this.#configuration.manifest.workerId,
        payload: { reasons: ["invalid-envelope"] },
      });
      return { accepted: false, reasons: ["invalid-envelope"] };
    }

    const envelope = parsed.data;
    const envelopeIdentity = canonicalJson(envelope);
    const priorAdmission = this.#admittedEnvelopes.get(envelope.jobId);
    if (
      priorAdmission?.identity === envelopeIdentity
      && this.#activeJobs.has(envelope.jobId)
    ) {
      return { accepted: true, jobId: envelope.jobId, duplicate: true };
    }
    if (priorAdmission) {
      return { accepted: false, reasons: ["duplicate-job"] };
    }

    const [policyVerified, signatureVerified, pathAllowed, resources] = await Promise.all([
      this.#ports.verifier.verifyPolicy(envelope),
      this.#ports.verifier.verifySignature(envelope),
      this.#ports.pathScope.isAllowed(envelope.safeWorkingDirectory),
      this.#inspectResources(),
    ]);
    const capabilities = new Set(this.#configuration.manifest.capabilities);
    const installedSkills = new Map(
      this.#configuration.manifest.skills.map((skill) => [skill.key, skill.version]),
    );
    const missingCapabilities = envelope.requiredCapabilities.filter(
      (capability) => !capabilities.has(capability),
    );
    const missingSkills = envelope.requiredSkills
      .filter((requirement) => {
        const installed = installedSkills.get(requirement.key);
        return !installed || !this.#ports.skills.satisfies(installed, requirement.versionRange);
      })
      .map((requirement) => requirement.key);
    const decision = evaluateWorkerPreflight({
      mode: this.#mode(),
      duplicateJob: false,
      contractCompatible: envelope.version === CONTRACT_VERSION,
      securityDomainMatches:
        envelope.securityDomain === this.#configuration.manifest.securityDomain,
      policyVerified,
      signatureVerified,
      leaseHolderMatches:
        envelope.lease.holderId === this.#configuration.manifest.principalId,
      leaseExpiresAtEpochMs: Date.parse(envelope.lease.expiresAt),
      nowEpochMs: Date.parse(this.#ports.clock.now()),
      pathAllowed,
      missingCapabilities,
      missingSkills,
      budget: envelope.resourceBudget,
      resources: this.#applyReservations(resources),
      minimumFreeDiskBytes: this.#configuration.limits.minimumFreeDiskBytes,
      maximumActiveWorktrees: this.#configuration.limits.maximumActiveWorktrees,
      maximumRunningJobs: this.#configuration.limits.maximumRunningJobs,
      maximumRuntimeSeconds: this.#configuration.limits.maximumRuntimeSeconds,
    });

    if (!decision.accepted) {
      await this.#recordEvent({
        type: "worker.job-rejected",
        entityType: "job",
        entityId: envelope.jobId,
        taskId: envelope.taskId,
        runId: envelope.runId,
        payload: { reasons: decision.reasons },
      });
      return decision;
    }

    await this.#recordEvent({
      type: "worker.job-admitted",
      entityType: "job",
      entityId: envelope.jobId,
      sourceEventId:
        `${this.#configuration.bootId}:${envelope.jobId}:worker.job-admitted:${envelope.lease.fencingToken}`,
      taskId: envelope.taskId,
      runId: envelope.runId,
      payload: {
        leaseFence: envelope.lease.fencingToken,
        automaticStart: false,
      },
    });
    this.#admittedEnvelopes.set(envelope.jobId, {
      identity: envelopeIdentity,
      envelope,
    });
    this.#activeJobs.add(envelope.jobId);
    return { accepted: true, jobId: envelope.jobId, duplicate: false };
  }

  cancel(jobId: string): Promise<WorkerCancellationResult> {
    return this.#runExclusive(() => this.#cancel(jobId));
  }

  async #cancel(jobId: string): Promise<WorkerCancellationResult> {
    if (!this.#started) {
      return { cancelled: false, jobId, reason: "supervisor-not-started" };
    }
    if (!this.#activeJobs.has(jobId)) {
      return {
        cancelled: false,
        jobId,
        reason: this.#admittedEnvelopes.has(jobId) ? "already-terminal" : "not-found",
      };
    }
    const admission = this.#admittedEnvelopes.get(jobId);
    await this.#recordEvent({
      type: "worker.job-cancelled",
      entityType: "job",
      entityId: jobId,
      sourceEventId:
        `${this.#configuration.bootId}:${jobId}:worker.job-cancelled`,
      ...(admission ? {
        taskId: admission.envelope.taskId,
        runId: admission.envelope.runId,
      } : {}),
      payload: { providerProcessStarted: false },
    });
    this.#activeJobs.delete(jobId);
    return { cancelled: true, jobId };
  }

  async #recordEvent(input: {
    readonly type: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly sourceEventId?: string;
    readonly taskId?: string;
    readonly runId?: string;
    readonly payload: Readonly<Record<string, unknown>>;
  }): Promise<void> {
    const occurredAt = this.#ports.clock.now();
    const event = normalizedEventSchema.parse({
      version: CONTRACT_VERSION,
      type: input.type,
      entity: { type: input.entityType, id: input.entityId },
      source: {
        kind: "worker",
        id: this.#configuration.manifest.workerId,
      },
      sourceEventId: input.sourceEventId
        ?? `${this.#configuration.bootId}:${this.#eventSequence}:${input.type}`,
      securityDomain: this.#configuration.manifest.securityDomain,
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      occurredAt,
      ingestedAt: occurredAt,
      payload: input.payload,
    });
    await this.#ports.controlPlane.recordEvent(event);
    if (!input.sourceEventId) this.#eventSequence += 1;
  }
}
