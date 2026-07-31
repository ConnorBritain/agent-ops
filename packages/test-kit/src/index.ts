import {
  CONTRACT_VERSION,
  type AttentionItem,
  type NormalizedEvent,
  type ProviderInvocation,
  type SignedJobEnvelope,
  type VerificationRecord,
  type WorkerHeartbeat,
  type WorkerManifest,
  type WorkerRegistration,
  type WorkerResourceSnapshot,
} from "@agent-ops/contracts";
import type {
  AttentionDraft,
  AttentionResponseRecord,
  CoordinatorDurableStore,
  CoordinatorIntent,
  CreateJobInput,
  DurableOperationOptions,
  LeaseGrant,
  ProviderAcknowledgement,
  ReconciliationSnapshot,
  SchedulingAuditRecord,
  PolicyDecision,
} from "@agent-ops/domain";
import type { WorkerSafetySnapshot } from "@agent-ops/policy";

export const testIds = {
  worker: "00000000-0000-4000-8000-000000000101",
  principal: "00000000-0000-4000-8000-000000000102",
  registration: "00000000-0000-4000-8000-000000000103",
  boot: "00000000-0000-4000-8000-000000000104",
  job: "00000000-0000-4000-8000-000000000105",
  task: "00000000-0000-4000-8000-000000000106",
  run: "00000000-0000-4000-8000-000000000107",
  policy: "00000000-0000-4000-8000-000000000108",
  providerInvocation: "00000000-0000-4000-8000-000000000109",
  coordinator: "00000000-0000-4000-8000-000000000110",
  attention: "00000000-0000-4000-8000-000000000111",
  verification: "00000000-0000-4000-8000-000000000112",
  delivery: "00000000-0000-4000-8000-000000000113",
} as const;

export class DeterministicClock {
  #epochMs: number;

  constructor(initial = "2026-07-30T04:00:00Z") {
    this.#epochMs = Date.parse(initial);
  }

  now(): string {
    return new Date(this.#epochMs).toISOString();
  }

  advance(milliseconds: number): void {
    this.#epochMs += milliseconds;
  }
}

export class StaticResourceInspector {
  snapshot: WorkerResourceSnapshot;

  constructor(snapshot: WorkerResourceSnapshot = {
    freeDiskBytes: 100_000,
    availableMemoryBytes: 50_000,
    activeWorktreeCount: 0,
    runningJobCount: 0,
  }) {
    this.snapshot = snapshot;
  }

  async inspect(): Promise<WorkerResourceSnapshot> {
    return { ...this.snapshot };
  }
}

export class StaticSafetyInspector {
  snapshot: WorkerSafetySnapshot;

  constructor(snapshot: WorkerSafetySnapshot = {
    resources: {
      freeDiskBytes: 100_000,
      availableMemoryBytes: 50_000,
      activeWorktreeCount: 0,
      runningJobCount: 0,
    },
    sessions: [],
    processes: [],
    cleanupCandidates: [],
  }) {
    this.snapshot = snapshot;
  }

  async inspectSafety(): Promise<WorkerSafetySnapshot> {
    return {
      resources: { ...this.snapshot.resources },
      sessions: this.snapshot.sessions.map((session) => ({ ...session })),
      processes: this.snapshot.processes.map((process) => ({ ...process })),
      cleanupCandidates: this.snapshot.cleanupCandidates.map((candidate) => ({ ...candidate })),
    };
  }
}

export type RebootIdleServiceFixture = {
  readonly platform: "systemd" | "launchd" | "windows-service-wrapper";
  readonly startsWithoutInteractiveLogin: boolean;
  readonly startsSupervisorOnly: boolean;
  readonly automaticWorkloadResume: boolean;
  readonly restartsSupervisorOnFailure: boolean;
};

export function assertRebootIdleServiceFixture(
  fixture: RebootIdleServiceFixture,
): RebootIdleServiceFixture {
  if (!fixture.startsWithoutInteractiveLogin) {
    throw new Error("A worker service must start without interactive login.");
  }
  if (!fixture.startsSupervisorOnly) {
    throw new Error("A worker service must start the supervisor only.");
  }
  if (fixture.automaticWorkloadResume) {
    throw new Error("A worker service must never automatically resume a workload.");
  }
  if (!fixture.restartsSupervisorOnFailure) {
    throw new Error("A worker service must recover the supervisor after its own failure.");
  }
  return fixture;
}

export class InMemoryWorkerControlPlane {
  readonly registrations: WorkerRegistration[] = [];
  readonly heartbeats: WorkerHeartbeat[] = [];
  readonly events: NormalizedEvent[] = [];

  async register(registration: WorkerRegistration): Promise<void> {
    this.registrations.push(registration);
  }

  async heartbeat(heartbeat: WorkerHeartbeat): Promise<void> {
    this.heartbeats.push(heartbeat);
  }

  async recordEvent(event: NormalizedEvent): Promise<void> {
    this.events.push(event);
  }
}

/**
 * Deterministic durable-port double for Coordinator application-service tests.
 * It records the exact persistence order and never reaches a database, a
 * provider, a chat service, or a host.
 */
export class InMemoryCoordinatorDurableStore implements CoordinatorDurableStore {
  readonly operations: string[] = [];
  readonly intents: CoordinatorIntent[] = [];
  readonly schedulingDecisions: SchedulingAuditRecord[] = [];
  readonly jobs: CreateJobInput[] = [];
  readonly workerEvents: NormalizedEvent[] = [];
  readonly attentionItems: AttentionItem[] = [];
  readonly attentionResponses: AttentionResponseRecord[] = [];
  readonly providerAcknowledgements: ProviderAcknowledgement[] = [];
  reconciliationSnapshots: readonly ReconciliationSnapshot[] = [];
  #attentionBySource = new Map<string, AttentionItem>();

  async acquireCoordinatorLease(input: {
    readonly leaseName: string;
    readonly holderPrincipalId: string;
    readonly ttlSeconds: number;
  }, options?: DurableOperationOptions): Promise<LeaseGrant> {
    options?.signal?.throwIfAborted();
    this.operations.push("lease");
    return {
      acquired: true,
      leaseName: input.leaseName,
      holderPrincipalId: input.holderPrincipalId,
      fencingToken: 1,
      expiresAt: "2026-07-30T04:05:00.000Z",
    };
  }

  async createJob(input: CreateJobInput, options?: DurableOperationOptions): Promise<string> {
    options?.signal?.throwIfAborted();
    this.operations.push("job");
    this.jobs.push(input);
    return input.envelope.jobId;
  }

  async recordWorkerEvent(
    event: NormalizedEvent,
    options?: DurableOperationOptions,
  ): Promise<string> {
    options?.signal?.throwIfAborted();
    this.operations.push("worker-event");
    this.workerEvents.push(event);
    return event.sourceEventId;
  }

  async recordIntent(
    intent: CoordinatorIntent,
    options?: DurableOperationOptions,
  ): Promise<string> {
    options?.signal?.throwIfAborted();
    this.operations.push("intent");
    this.intents.push(intent);
    return intent.command.idempotencyKey;
  }

  async recordSchedulingDecision(
    audit: SchedulingAuditRecord,
    options?: DurableOperationOptions,
  ): Promise<string> {
    options?.signal?.throwIfAborted();
    this.operations.push("scheduling");
    this.schedulingDecisions.push(audit);
    return `${audit.runId}:scheduling`;
  }

  async createAttention(
    draft: AttentionDraft,
    options?: DurableOperationOptions,
  ): Promise<AttentionItem> {
    options?.signal?.throwIfAborted();
    const existing = this.#attentionBySource.get(draft.sourceEventId);
    if (existing) return existing;
    this.operations.push("attention");
    const item: AttentionItem = {
      version: CONTRACT_VERSION,
      id: `${testIds.attention.slice(0, -3)}${String(111 + this.attentionItems.length).padStart(3, "0")}`,
      taskId: draft.taskId,
      ...(draft.runId ? { runId: draft.runId } : {}),
      securityDomain: draft.securityDomain,
      type: draft.type,
      summary: draft.summary,
      ...(draft.verbatimQuestion ? { verbatimQuestion: draft.verbatimQuestion } : {}),
    };
    this.#attentionBySource.set(draft.sourceEventId, item);
    this.attentionItems.push(item);
    return item;
  }

  async recordAttentionResponse(
    response: AttentionResponseRecord,
    options?: DurableOperationOptions,
  ): Promise<AttentionItem> {
    options?.signal?.throwIfAborted();
    const index = this.attentionItems.findIndex((item) => item.id === response.attentionItemId);
    if (index < 0) throw new Error("Attention item does not exist in the deterministic store.");
    const prior = this.attentionItems[index];
    if (!prior) throw new Error("Attention item was unexpectedly absent.");
    this.operations.push("attention-response");
    const updated: AttentionItem = { ...prior, durableResponse: response.response };
    this.attentionItems[index] = updated;
    this.attentionResponses.push(response);
    return updated;
  }

  async recordProviderAcknowledgement(
    acknowledgement: ProviderAcknowledgement,
    options?: DurableOperationOptions,
  ): Promise<string> {
    options?.signal?.throwIfAborted();
    this.operations.push("provider-acknowledgement");
    this.providerAcknowledgements.push(acknowledgement);
    return `${acknowledgement.jobId}:acknowledgement`;
  }

  async listReconciliationSnapshots(
    options?: DurableOperationOptions,
  ): Promise<readonly ReconciliationSnapshot[]> {
    options?.signal?.throwIfAborted();
    this.operations.push("reconciliation-read");
    return this.reconciliationSnapshots.map((snapshot) => ({ ...snapshot }));
  }
}

export type RoadmapReadCall = {
  readonly method: "plan" | "show";
  readonly invoke?: string;
};

export class StaticRoadmapReadTransport {
  readonly calls: RoadmapReadCall[] = [];
  readonly planResult: unknown;
  readonly sliceDetails: Readonly<Record<string, unknown>>;

  constructor(
    planResult: unknown,
    sliceDetails: Readonly<Record<string, unknown>>,
  ) {
    this.planResult = planResult;
    this.sliceDetails = sliceDetails;
  }

  async plan(options?: { readonly signal?: AbortSignal }): Promise<unknown> {
    options?.signal?.throwIfAborted();
    this.calls.push({ method: "plan" });
    return this.planResult;
  }

  async showSlice(
    input: { readonly invoke: string },
    options?: { readonly signal?: AbortSignal },
  ): Promise<unknown> {
    options?.signal?.throwIfAborted();
    this.calls.push({ method: "show", invoke: input.invoke });
    const detail = this.sliceDetails[input.invoke];
    if (detail === undefined) throw new Error(`Missing static Roadmap detail: ${input.invoke}`);
    return detail;
  }
}

/**
 * Deterministic JSON-RPC transcript double for a provider protocol. It models
 * message ordering only; it never starts a process, connects a socket, or
 * materializes credentials.
 */
export type ScriptedJsonRpcRequestStep = {
  readonly type?: "request";
  readonly method: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly errorMessage?: string;
};

export type ScriptedJsonRpcNotificationStep = {
  readonly type: "notification";
  readonly method: string;
  readonly params?: unknown;
};

export type ScriptedJsonRpcStep = ScriptedJsonRpcRequestStep | ScriptedJsonRpcNotificationStep;

export class ScriptedJsonRpcTransport {
  readonly requests: { method: string; params: unknown }[] = [];
  readonly notifications: { method: string; params: unknown }[] = [];
  #steps: ScriptedJsonRpcStep[];

  constructor(steps: readonly ScriptedJsonRpcStep[]) {
    this.#steps = [...steps];
  }

  async request(method: string, params: unknown = {}): Promise<unknown> {
    const expected = this.#steps.shift();
    if (!expected) throw new Error(`Unexpected JSON-RPC request: ${method}`);
    if (
      expected.type === "notification"
      ||
      expected.method !== method
      || (expected.params !== undefined && JSON.stringify(expected.params) !== JSON.stringify(params))
    ) {
      throw new Error(`Unexpected JSON-RPC request: ${method}`);
    }
    this.requests.push({ method, params });
    if (expected.errorMessage) throw new Error(expected.errorMessage);
    return expected.result;
  }

  async notify(method: string, params: unknown = {}): Promise<void> {
    const expected = this.#steps.shift();
    if (!expected) throw new Error(`Unexpected JSON-RPC notification: ${method}`);
    if (
      expected.type !== "notification"
      || expected.method !== method
      || (expected.params !== undefined && JSON.stringify(expected.params) !== JSON.stringify(params))
    ) {
      throw new Error(`Unexpected JSON-RPC notification: ${method}`);
    }
    this.notifications.push({ method, params });
  }

  assertComplete(): void {
    if (this.#steps.length) {
      throw new Error(`Unconsumed JSON-RPC steps: ${this.#steps.map((step) => step.method).join(",")}`);
    }
  }
}

/**
 * Structural fakes for the Slack attention adapter. These types intentionally
 * live below the adapter boundary so the test kit never depends on a concrete
 * chat implementation, SDK, credential, workspace, or network connection.
 */
export type SlackIngressFixtureReceipt = {
  readonly receiptId: string;
  readonly envelopeId: string;
  readonly workspaceId: string;
  readonly actorExternalId: string;
  readonly receivedAt: string;
};

export class InMemorySlackIngressStore {
  readonly operations: string[] = [];
  readonly receipts = new Map<string, {
    readonly receipt: SlackIngressFixtureReceipt;
    outcome?: "accepted" | "rejected";
  }>();

  async reserve(receipt: SlackIngressFixtureReceipt): Promise<
    | { readonly state: "pending" }
    | { readonly state: "completed"; readonly outcome: "accepted" | "rejected" }
  > {
    this.operations.push("ingress-reserve");
    const existing = this.receipts.get(receipt.receiptId);
    if (existing?.outcome) return { state: "completed", outcome: existing.outcome };
    if (!existing) this.receipts.set(receipt.receiptId, { receipt });
    return { state: "pending" };
  }

  async complete(input: {
    readonly receiptId: string;
    readonly outcome: "accepted" | "rejected";
    readonly completedAt: string;
  }): Promise<void> {
    this.operations.push(`ingress-complete:${input.outcome}`);
    const existing = this.receipts.get(input.receiptId);
    if (!existing) throw new Error("Slack ingress receipt was not reserved.");
    this.receipts.set(input.receiptId, { ...existing, outcome: input.outcome });
  }
}

export class StaticSlackWorkspaceActorAuthorizer {
  authorization: {
    readonly authorized: true;
    readonly principalId: string;
    readonly securityDomain: string;
  } | {
    readonly authorized: false;
    readonly reason: "unknown-workspace" | "unknown-actor" | "domain-not-authorized";
  } = {
    authorized: true,
    principalId: testIds.principal,
    securityDomain: "example-domain",
  };
  readonly calls: { workspaceId: string; actorExternalId: string }[] = [];

  async authorize(input: { readonly workspaceId: string; readonly actorExternalId: string }) {
    this.calls.push({ ...input });
    return this.authorization;
  }
}

export class RecordingSlackSocketAcknowledger {
  readonly acknowledgements: { envelopeId: string }[] = [];

  async acknowledge(input: { readonly envelopeId: string }): Promise<void> {
    this.acknowledgements.push({ ...input });
  }
}

export class StaticSlackAttentionAudienceResolver {
  audience: { readonly recipientRef: string } | undefined = {
    recipientRef: "slack-recipient:fixture",
  };
  readonly calls: { securityDomain: string; purpose: string }[] = [];

  async resolve(input: { readonly securityDomain: string; readonly purpose: string }) {
    this.calls.push({ ...input });
    return this.audience;
  }
}

export class RecordingSlackAttentionOutbox {
  readonly messages: unknown[] = [];
  result: { readonly status: "delivered" | "deferred"; readonly deliveryReference?: string } = {
    status: "delivered",
    deliveryReference: "slack-outbox:fixture",
  };
  throwOnSend = false;

  async send(message: unknown): Promise<{
    readonly status: "delivered" | "deferred";
    readonly deliveryReference?: string;
  }> {
    this.messages.push(message);
    if (this.throwOnSend) throw new Error("fixture Slack outbox unavailable");
    return this.result;
  }
}

export type FixtureVerifiedDraftDeliveryResult =
  | {
    readonly kind: "draft-created";
    readonly verification: VerificationRecord;
    readonly pullRequest: { readonly draft: true; readonly pullRequestRef: string };
  }
  | {
    readonly kind: "blocked-verification";
    readonly verification: VerificationRecord;
  }
  | {
    readonly kind: "blocked-policy";
    readonly verification: VerificationRecord;
    readonly policyDecision: PolicyDecision;
  };

/**
 * A structural durable double for verified-draft delivery tests. It models a
 * pending reservation and completion replay without a GitHub repository,
 * outbox runner, external verifier, or credential.
 */
export class InMemoryDraftDeliveryStore {
  readonly operations: string[] = [];
  readonly verifications: VerificationRecord[] = [];
  readonly gates: {
    deliveryId: string;
    verificationId: string;
    policyDecision?: PolicyDecision;
    allowed: boolean;
  }[] = [];
  readonly completed = new Map<string, FixtureVerifiedDraftDeliveryResult>();

  async reserve(input: { readonly deliveryId: string }): Promise<
    | { readonly state: "pending" }
    | { readonly state: "completed"; readonly result: FixtureVerifiedDraftDeliveryResult }
  > {
    this.operations.push("delivery-reserve");
    const prior = this.completed.get(input.deliveryId);
    return prior ? { state: "completed", result: prior } : { state: "pending" };
  }

  async recordVerification(verification: VerificationRecord): Promise<void> {
    this.operations.push("verification");
    if (!this.verifications.some((entry) => entry.id === verification.id)) {
      this.verifications.push(verification);
    }
  }

  async recordGate(input: {
    readonly deliveryId: string;
    readonly verificationId: string;
    readonly policyDecision?: PolicyDecision;
    readonly allowed: boolean;
    readonly recordedAt: string;
  }): Promise<void> {
    this.operations.push(input.allowed ? "delivery-gate-allow" : "delivery-gate-block");
    this.gates.push({
      deliveryId: input.deliveryId,
      verificationId: input.verificationId,
      ...(input.policyDecision ? { policyDecision: input.policyDecision } : {}),
      allowed: input.allowed,
    });
  }

  async complete(input: {
    readonly deliveryId: string;
    readonly result: FixtureVerifiedDraftDeliveryResult;
    readonly completedAt: string;
  }): Promise<void> {
    this.operations.push("delivery-complete");
    this.completed.set(input.deliveryId, input.result);
  }
}

export class StaticIndependentVerifier {
  result: VerificationRecord;
  readonly calls: string[] = [];

  constructor(result: VerificationRecord) {
    this.result = result;
  }

  async verify(): Promise<VerificationRecord> {
    this.calls.push("independent-verifier");
    return this.result;
  }
}

export class StaticDraftDeliveryPolicy {
  decision: PolicyDecision;
  readonly calls: string[] = [];

  constructor(decision: PolicyDecision) {
    this.decision = decision;
  }

  async evaluate(): Promise<PolicyDecision> {
    this.calls.push("draft-delivery-policy");
    return this.decision;
  }
}

export class RecordingDraftPullRequestGateway {
  readonly intents: unknown[] = [];
  result: { readonly draft: true; readonly pullRequestRef: string } = {
    draft: true,
    pullRequestRef: "draft-pr://fixture/reversible-change/1",
  };
  throwOnCreate = false;

  async createDraft(intent: unknown): Promise<{ readonly draft: true; readonly pullRequestRef: string }> {
    this.intents.push(intent);
    if (this.throwOnCreate) throw new Error("fixture draft gateway unavailable");
    return this.result;
  }
}

export const buildWorkerManifest = (
  overrides: Partial<WorkerManifest> = {},
): WorkerManifest => ({
  version: CONTRACT_VERSION,
  workerId: testIds.worker,
  principalId: testIds.principal,
  securityDomain: "example-domain",
  runtimeVersion: "0.1.0",
  capabilities: ["terminal", "git"],
  skills: [{ key: "repository-inspection", version: "1.2.0" }],
  providers: [],
  generatedAt: "2026-07-30T04:00:00Z",
  ...overrides,
});

export const buildJobEnvelope = (
  overrides: Partial<SignedJobEnvelope> = {},
): SignedJobEnvelope => ({
  version: CONTRACT_VERSION,
  jobId: testIds.job,
  taskId: testIds.task,
  runId: testIds.run,
  securityDomain: "example-domain",
  requiredCapabilities: ["terminal"],
  requiredSkills: [{ key: "repository-inspection", versionRange: "^1" }],
  policyDecisionId: testIds.policy,
  lease: {
    leaseName: "worker-job",
    holderId: testIds.principal,
    fencingToken: 1,
    expiresAt: "2026-07-30T04:05:00Z",
  },
  safeWorkingDirectory: "/workspace/example",
  resourceBudget: {
    minimumFreeDiskBytes: 10_000,
    memoryReservationBytes: 5_000,
    worktreeSlots: 1,
    maximumRuntimeSeconds: 900,
  },
  redactionPolicyRef: "policy://redaction/default",
  callbackIdentityRef: "secret://agentops/callback/worker",
  body: { objective: "Run a harmless deterministic fixture." },
  signature: {
    algorithm: "ed25519",
    keyRef: "secret://agentops/signing/coordinator",
    value: "a".repeat(64),
  },
  ...overrides,
});

export const buildProviderInvocation = (
  overrides: Partial<ProviderInvocation> = {},
): ProviderInvocation => ({
  version: CONTRACT_VERSION,
  invocationId: testIds.providerInvocation,
  operation: "start",
  envelope: buildJobEnvelope(),
  input: {},
  requestedAt: "2026-07-30T04:00:00Z",
  ...overrides,
});
