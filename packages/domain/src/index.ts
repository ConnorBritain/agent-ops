import type {
  AttentionItem,
  AllocationRecord,
  BackupVerificationRecord,
  CompatibilityManifest,
  Command,
  CoordinatorProjectionCommand,
  EffortMeasurement,
  EstimateRecord,
  ExternalProjectionFact,
  MigrationGate,
  NormalizedEvent,
  PlanningFeedback,
  PromotionRecord,
  RateCard,
  ReleaseCompatibilityComponent,
  ReleaseGateRecord,
  ResourceBudget,
  SkillRequirement,
  SignedJobEnvelope,
  WorkerReplacementRecord,
  WorkerMode,
  WorkerResourceSnapshot,
  CuratedMemoryRecord,
  MemoryCandidate,
  MemoryRetrievalQuery,
} from "@agent-ops/contracts";

export type PolicyDecision = {
  readonly id: string;
  readonly decision: "allow" | "deny" | "requires-approval";
  readonly securityDomain: string;
  readonly rationale: string;
};

/** A worker's local evidence of an installed portable primitive. */
export type PlacementInstalledSkill = {
  readonly key: string;
  readonly version: string;
  readonly bundleId: string;
};

export type PlacementCandidate = {
  readonly workerId: string;
  readonly providerId: string;
  readonly securityDomain: string;
  readonly capabilities: ReadonlySet<string>;
  readonly skills: readonly PlacementInstalledSkill[];
  readonly healthy: boolean;
  readonly preferenceScore: number;
};

export type PlacementRequest = {
  readonly securityDomain: string;
  readonly requiredCapabilities: readonly string[];
  readonly requiredSkills: readonly SkillRequirement[];
  readonly preferredProviderId?: string;
  readonly policyDecision: PolicyDecision;
};

type ParsedVersion = readonly [number, number, number];

const parseVersion = (value: string): ParsedVersion | undefined => {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-[0-9A-Za-z.-]+)?$/.exec(value);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
};

const compareVersions = (left: ParsedVersion, right: ParsedVersion): number => {
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
};

/**
 * This is only deterministic compatibility policy for declared manifests; it
 * is not a duplicate implementation of any primitive or its estimator.
 */
export const skillVersionSatisfies = (installed: string, requested: string): boolean => {
  if (requested === "*") return true;
  const installedVersion = parseVersion(installed);
  const range = /^(\^|~|>=)?(\d+(?:\.\d+)?(?:\.\d+)?)(?:-[0-9A-Za-z.-]+)?$/.exec(requested);
  if (!installedVersion || !range) return false;
  const requiredVersion = parseVersion(range[2]!);
  if (!requiredVersion) return false;
  const operator = range[1] ?? "";
  const requestedParts = range[2]!.split(".").length;
  const comparison = compareVersions(installedVersion, requiredVersion);
  if (operator === ">=") return comparison >= 0;
  if (operator === "^") {
    if (requestedParts === 1) {
      return installedVersion[0] === requiredVersion[0] && comparison >= 0;
    }
    if (requiredVersion[0] > 0) {
      return installedVersion[0] === requiredVersion[0] && comparison >= 0;
    }
    if (requestedParts === 2 || requiredVersion[1] > 0) {
      return installedVersion[0] === 0
        && installedVersion[1] === requiredVersion[1]
        && comparison >= 0;
    }
    return installedVersion[0] === 0
      && installedVersion[1] === 0
      && installedVersion[2] === requiredVersion[2];
  }
  if (operator === "~") {
    return requestedParts === 1
      ? installedVersion[0] === requiredVersion[0] && comparison >= 0
      : installedVersion[0] === requiredVersion[0]
        && installedVersion[1] === requiredVersion[1]
        && comparison >= 0;
  }
  return requestedParts === 1
    ? installedVersion[0] === requiredVersion[0]
    : requestedParts === 2
      ? installedVersion[0] === requiredVersion[0] && installedVersion[1] === requiredVersion[1]
      : comparison === 0;
};

export type PlacementResult =
  | {
    readonly accepted: true;
    readonly selected: PlacementCandidate;
    readonly exclusions: readonly {
      readonly workerId: string;
      readonly reason: string;
    }[];
    readonly rationale: string;
  }
  | {
    readonly accepted: false;
    readonly reason: "policy-denied" | "approval-required" | "no-eligible-candidate";
    readonly exclusions: readonly {
      readonly workerId: string;
      readonly reason: string;
    }[];
  };

function excludeReason(
  request: PlacementRequest,
  candidate: PlacementCandidate,
): string | undefined {
  if (candidate.securityDomain !== request.securityDomain) return "security-domain-mismatch";
  if (!candidate.healthy) return "worker-unhealthy";
  const missing = request.requiredCapabilities.filter(
    (capability) => !candidate.capabilities.has(capability),
  );
  if (missing.length) return `missing-capabilities:${missing.sort().join(",")}`;
  for (const required of request.requiredSkills) {
    // The contract currently allows only enforced requirements. Keep this
    // conditional for forward-compatible manifests that may also report
    // advisory capabilities without making them dispatch authority.
    if (required.enforcement !== "enforced") continue;
    const installed = candidate.skills.find((skill) => skill.key === required.key);
    if (!installed) return `missing-enforced-skill:${required.key}`;
    if (!skillVersionSatisfies(installed.version, required.versionRange)) {
      return `incompatible-enforced-skill:${required.key}`;
    }
  }
  return undefined;
}

export function selectPlacement(
  request: PlacementRequest,
  candidates: readonly PlacementCandidate[],
): PlacementResult {
  if (
    request.policyDecision.securityDomain !== request.securityDomain
    || request.policyDecision.decision === "deny"
  ) {
    return { accepted: false, reason: "policy-denied", exclusions: [] };
  }
  if (request.policyDecision.decision === "requires-approval") {
    return { accepted: false, reason: "approval-required", exclusions: [] };
  }

  const exclusions: { workerId: string; reason: string }[] = [];
  const eligible = candidates.filter((candidate) => {
    const reason = excludeReason(request, candidate);
    if (reason) exclusions.push({ workerId: candidate.workerId, reason });
    return !reason;
  });

  const selected = [...eligible].sort((left, right) => {
    const leftPreferred = left.providerId === request.preferredProviderId ? 1 : 0;
    const rightPreferred = right.providerId === request.preferredProviderId ? 1 : 0;
    return rightPreferred - leftPreferred
      || right.preferenceScore - left.preferenceScore
      || left.workerId.localeCompare(right.workerId);
  })[0];

  if (!selected) {
    return { accepted: false, reason: "no-eligible-candidate", exclusions };
  }

  return {
    accepted: true,
    selected,
    exclusions,
    rationale: `eligible after policy, domain, health, capability, and enforced-skill filters; score=${selected.preferenceScore}`,
  };
}

export type LeaseGrant = {
  readonly acquired: boolean;
  readonly leaseName: string;
  readonly holderPrincipalId: string;
  readonly fencingToken: number;
  readonly expiresAt: string;
};

export type CreateJobInput = {
  readonly envelope: SignedJobEnvelope;
  readonly workerId: string;
  readonly providerId: string;
  readonly idempotencyKey: string;
};

export type DurableOperationOptions = {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
};

export interface DurableOperationalStore {
  acquireCoordinatorLease(input: {
    readonly leaseName: string;
    readonly holderPrincipalId: string;
    readonly ttlSeconds: number;
  }, options?: DurableOperationOptions): Promise<LeaseGrant>;
  createJob(input: CreateJobInput, options?: DurableOperationOptions): Promise<string>;
  recordWorkerEvent(
    event: NormalizedEvent,
    options?: DurableOperationOptions,
  ): Promise<string>;
}

/**
 * A durable record of an intent received by the Coordinator. It is deliberately
 * separate from a job: an intent can be denied, require approval, or fail
 * placement without ever becoming executable work.
 */
export type CoordinatorIntent = {
  readonly command: Command;
  readonly taskId: string;
  readonly runId: string;
  readonly securityDomain: string;
  readonly persistedAt: string;
};

export type SchedulingAuditRecord = {
  readonly taskId: string;
  readonly runId: string;
  readonly securityDomain: string;
  readonly policyDecision: PolicyDecision;
  readonly requiredCapabilities: readonly string[];
  readonly requiredSkills: readonly SkillRequirement[];
  readonly preferredProviderId?: string;
  readonly candidates: readonly {
    readonly workerId: string;
    readonly providerId: string;
    readonly securityDomain: string;
    readonly capabilities: readonly string[];
    readonly skills: readonly PlacementInstalledSkill[];
    readonly healthy: boolean;
    readonly preferenceScore: number;
  }[];
  readonly placement: PlacementResult;
  readonly recordedAt: string;
};

/** Durable source-only ports for separately versioned estimation and accounting adapters. */
export interface FinOpsLedgerStore {
  recordEstimate(estimate: EstimateRecord): Promise<void>;
  recordEffort(measurement: EffortMeasurement): Promise<void>;
  recordRateCard(rateCard: RateCard): Promise<void>;
  recordAllocation(allocation: AllocationRecord): Promise<void>;
  recordPlanningFeedback(feedback: PlanningFeedback): Promise<void>;
}

export type FinOpsLineageInput = {
  readonly estimate: EstimateRecord;
  readonly effort: readonly EffortMeasurement[];
  readonly rateCards: readonly RateCard[];
  readonly allocations: readonly AllocationRecord[];
  readonly planningFeedback: PlanningFeedback;
};

const hasSameLineage = (
  record: { readonly taskId: string; readonly runId: string; readonly securityDomain: string },
  reference: { readonly taskId: string; readonly runId: string; readonly securityDomain: string },
): boolean => record.taskId === reference.taskId
  && record.runId === reference.runId
  && record.securityDomain === reference.securityDomain;

/**
 * Validates accounting and planning correlations without calculating a price,
 * interpreting a primitive, or claiming to be an accounting system of record.
 */
export function assertFinOpsLineage(input: FinOpsLineageInput): FinOpsLineageInput {
  const { estimate, effort, rateCards, allocations, planningFeedback } = input;
  if (!hasSameLineage(planningFeedback, estimate) || planningFeedback.estimateId !== estimate.id) {
    throw new Error("Planning feedback must reference an estimate with the same task, run, and security domain.");
  }
  const effortById = new Map(effort.map((measurement) => [measurement.id, measurement]));
  for (const measurement of effort) {
    if (!hasSameLineage(measurement, estimate)) {
      throw new Error("Effort measurements must retain the same task, run, and security domain as their estimate.");
    }
  }
  for (const effortId of planningFeedback.effortMeasurementIds) {
    const measurement = effortById.get(effortId);
    if (!measurement || !hasSameLineage(measurement, estimate)) {
      throw new Error("Planning feedback must reference effort records with the same task, run, and security domain.");
    }
  }
  const rateCardById = new Map(rateCards.map((rateCard) => [rateCard.id, rateCard]));
  const allocationById = new Map(allocations.map((allocation) => [allocation.id, allocation]));
  for (const allocation of allocations) {
    if (!hasSameLineage(allocation, estimate)) {
      throw new Error("Allocations must retain the same task, run, and security domain as their estimate.");
    }
    const rateCard = rateCardById.get(allocation.rateCardId);
    const rateEntry = rateCard?.entries.find((entry) => entry.key === allocation.rateKey);
    if (
      !rateCard
      || rateCard.rateCardVersion !== allocation.rateCardVersion
      || !rateEntry
      || rateEntry.unit !== allocation.unit
      || rateEntry.currency !== allocation.currency
    ) {
      throw new Error("Allocation must retain a compatible versioned rate-card entry.");
    }
  }
  for (const allocationId of planningFeedback.allocationIds) {
    if (!allocationById.has(allocationId)) {
      throw new Error("Planning feedback must reference an allocation retained by the same lineage set.");
    }
  }
  return input;
}

export type CompatibilityObservation = {
  readonly component: ReleaseCompatibilityComponent;
  readonly version: string;
};

const hasSameIdentifiers = (left: readonly string[], right: readonly string[]): boolean => {
  if (left.length !== right.length) return false;
  const leftIds = new Set(left);
  const rightIds = new Set(right);
  return leftIds.size === left.length
    && rightIds.size === right.length
    && [...leftIds].every((id) => rightIds.has(id));
};

/**
 * Evaluates only the small declarative range grammar from the public contract.
 * It is a compatibility gate, not a package manager, updater, installer, or
 * deployment controller.
 */
export function compatibilityVersionSatisfies(version: string, range: string): boolean {
  if (range === "*") return Boolean(parseVersion(version));
  const observed = parseVersion(version);
  if (!observed) return false;
  const comparators = range.trim().split(/\s+/);
  return comparators.every((comparator) => {
    const match = /^(\^|~|>=|>|<=|<)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(comparator);
    if (!match) return false;
    const expected = parseVersion(match[2]!);
    if (!expected) return false;
    const comparison = compareVersions(observed, expected);
    switch (match[1] ?? "") {
      case ">=": return comparison >= 0;
      case ">": return comparison > 0;
      case "<=": return comparison <= 0;
      case "<": return comparison < 0;
      case "^":
        return expected[0] > 0
          ? observed[0] === expected[0] && comparison >= 0
          : expected[1] > 0
            ? observed[0] === 0 && observed[1] === expected[1] && comparison >= 0
            : observed[0] === 0 && observed[1] === 0 && observed[2] === expected[2];
      case "~":
        return observed[0] === expected[0]
          && observed[1] === expected[1]
          && comparison >= 0;
      default: return comparison === 0;
    }
  });
}

/**
 * Checks a declared release manifest against independently supplied component
 * observations. The manifest has no vendor, host, credential, or transport
 * authority; an incompatibility simply blocks promotion.
 */
export function assertReleaseCompatibility(input: {
  readonly manifest: CompatibilityManifest;
  readonly observations: readonly CompatibilityObservation[];
}): typeof input {
  const observedByComponent = new Map(input.observations.map((entry) => [entry.component, entry]));
  if (observedByComponent.size !== input.observations.length) {
    throw new Error("Compatibility observations must contain each component at most once.");
  }
  for (const declaration of input.manifest.declarations) {
    const observed = observedByComponent.get(declaration.component);
    if (!observed) {
      throw new Error(`Missing compatibility observation: ${declaration.component}.`);
    }
    if (!compatibilityVersionSatisfies(observed.version, declaration.acceptsVersionRange)) {
      throw new Error(`Incompatible ${declaration.component} version: ${observed.version}.`);
    }
  }
  return input;
}

export interface ReleaseRecoveryLedgerStore {
  recordCompatibilityManifest(manifest: CompatibilityManifest): Promise<void>;
  recordPromotion(promotion: PromotionRecord): Promise<void>;
  recordMigrationGate(migration: MigrationGate): Promise<void>;
  recordBackupVerification(backup: BackupVerificationRecord): Promise<void>;
  recordWorkerReplacement(replacement: WorkerReplacementRecord): Promise<void>;
  recordReleaseGate(gate: ReleaseGateRecord): Promise<void>;
}

export type ReleaseRecoveryLineageInput = {
  readonly manifest: CompatibilityManifest;
  readonly observations: readonly CompatibilityObservation[];
  readonly promotions: readonly PromotionRecord[];
  readonly migrations: readonly MigrationGate[];
  readonly backups: readonly BackupVerificationRecord[];
  readonly replacement: WorkerReplacementRecord;
  readonly gate: ReleaseGateRecord;
};

const hasFullBackupCoverage = (backup: BackupVerificationRecord): boolean => {
  const required = new Set([
    "durable-operational-state",
    "versioned-configuration",
    "persistent-memory-data",
    "documented-secret-references",
  ]);
  return backup.integrity === "verified"
    && backup.restoration === "verified"
    && backup.coverage.length === required.size
    && backup.coverage.every((entry) => required.has(entry));
};

/**
 * Validates a complete deterministic release/recovery rehearsal. It does not
 * call a backup provider, apply a migration, register a worker, control a
 * service, or change a host. A caller must persist approved source facts
 * through its own durable port after this pure gate passes.
 */
export function assertReleaseRecoveryLineage(
  input: ReleaseRecoveryLineageInput,
): ReleaseRecoveryLineageInput {
  assertReleaseCompatibility({ manifest: input.manifest, observations: input.observations });
  const releaseId = input.manifest.releaseId;
  const mustMatchRelease = [
    ...input.promotions,
    ...input.migrations,
    ...input.backups,
    input.replacement,
    input.gate,
  ];
  if (mustMatchRelease.some((record) => record.releaseId !== releaseId)) {
    throw new Error("Release-recovery evidence must retain one immutable internal release identity.");
  }
  if (input.gate.compatibilityManifestId !== input.manifest.id) {
    throw new Error("Release gate must reference the compatibility manifest it evaluated.");
  }

  const expectedPromotions: ReadonlyArray<readonly ["development" | "canary", "canary" | "stable"]> = [
    ["development", "canary"],
    ["canary", "stable"],
  ];
  if (input.promotions.length !== expectedPromotions.length) {
    throw new Error("Release recovery requires recorded development-to-canary and canary-to-stable promotions.");
  }
  for (const [fromChannel, toChannel] of expectedPromotions) {
    const promotion = input.promotions.find(
      (record) => record.fromChannel === fromChannel && record.toChannel === toChannel,
    );
    if (!promotion || promotion.compatibilityManifestId !== input.manifest.id) {
      throw new Error(`Release promotion is missing a passed compatibility record: ${fromChannel}->${toChannel}.`);
    }
  }
  if (!hasSameIdentifiers(input.gate.promotionIds, input.promotions.map((record) => record.id))) {
    throw new Error("Release gate must reference exactly the recorded promotion path.");
  }

  if (!input.migrations.length || !hasSameIdentifiers(
    input.gate.migrationGateIds,
    input.migrations.map((record) => record.id),
  )) {
    throw new Error("Release gate must reference every append-only migration gate.");
  }
  const backup = input.backups.find((record) => record.id === input.gate.backupVerificationId);
  if (!backup || !hasFullBackupCoverage(backup)) {
    throw new Error("Release gate requires a verified, restoration-tested full backup record.");
  }
  for (const migration of input.migrations) {
    if (!migration.appendOnly || migration.strategy !== "expand-before-contract") {
      throw new Error("Migration gates must remain append-only and expand-before-contract.");
    }
    if (migration.operation === "destructive") {
      const migrationBackup = input.backups.find((record) => record.id === migration.backupVerificationId);
      if (!migrationBackup || !hasFullBackupCoverage(migrationBackup)) {
        throw new Error("Destructive migration is blocked without verified full backup coverage.");
      }
      if (!migration.approval || !migration.forwardRepairRunbookRef) {
        throw new Error("Destructive migration is blocked without human approval and forward repair instructions.");
      }
    }
  }

  if (input.gate.replacementRecordId !== input.replacement.id) {
    throw new Error("Release gate must reference its simulated worker replacement record.");
  }
  if (!hasSameIdentifiers(
    input.replacement.durableLedger.immutableRecordIds,
    input.replacement.restoredLedgerRecordIds,
  )) {
    throw new Error("Worker replacement is blocked because it did not preserve the durable ledger.");
  }
  if (input.gate.redactionVerification !== "passed") {
    throw new Error("Release gate is blocked by failed redaction verification.");
  }
  if (!input.gate.criticalSafetyTests.length || input.gate.criticalSafetyTests.some((test) => test.status !== "passed")) {
    throw new Error("Release gate is blocked by an unaddressed critical safety test.");
  }
  if (input.gate.verdict !== "passed") {
    throw new Error("Release gate must record a passed verdict only after every prerequisite passes.");
  }
  return input;
}

export type AttentionDraft = {
  readonly taskId: string;
  readonly runId?: string;
  readonly securityDomain: string;
  readonly type: AttentionItem["type"];
  readonly summary: string;
  readonly verbatimQuestion?: string;
  /** A stable source identity makes a repeated reconciliation safe to deduplicate. */
  readonly sourceEventId: string;
  readonly raisedAt: string;
};

export type AttentionResponseRecord = {
  readonly attentionItemId: string;
  readonly command: Command;
  readonly response: Readonly<Record<string, unknown>>;
  readonly persistedAt: string;
};

/**
 * A delivery result is deliberately narrower than an execution state. A
 * projection can report that it accepted or deferred a message, but it cannot
 * claim that a person, worker, or provider acted on it.
 */
export type AttentionDeliveryAttempt = {
  readonly status: "delivered" | "deferred";
  readonly deliveryReference?: string;
};

/**
 * Human-facing transports are projections of durable attention only. They
 * never become an alternate operational store or a source of task/run state.
 * Keeping this port in the domain package lets a Coordinator composition use a
 * chat adapter without making apps depend on adapters.
 */
export interface AttentionProjectionPort {
  deliver(attention: AttentionItem): Promise<AttentionDeliveryAttempt>;
  deliverResponse(input: {
    readonly attention: AttentionItem;
    readonly response: Readonly<Record<string, unknown>>;
  }): Promise<AttentionDeliveryAttempt>;
}

/**
 * A durable outbox reservation is the authority boundary for external
 * projections. It holds an already-issued Coordinator command and never
 * represents task/run state itself. The runner is explicitly invoked; there is
 * no in-process retry loop or autonomous external recovery here.
 */
export type ExternalProjectionOutboxRecord = {
  readonly command: CoordinatorProjectionCommand;
  readonly state: "pending" | "processing" | "delivered" | "dead-letter";
  readonly attempts: number;
  readonly fact?: ExternalProjectionFact;
  readonly lastErrorCode?: "external-unavailable" | "protocol-invalid";
};

export type ExternalProjectionReservation =
  | { readonly state: "new" }
  | { readonly state: "pending" | "processing" | "dead-letter" }
  | { readonly state: "delivered"; readonly fact: ExternalProjectionFact };

export type ExternalProjectionClaim =
  | { readonly state: "claimed"; readonly record: ExternalProjectionOutboxRecord }
  | { readonly state: "not-ready" }
  | { readonly state: "delivered"; readonly fact: ExternalProjectionFact };

export interface ExternalProjectionOutboxStore {
  reserve(command: CoordinatorProjectionCommand): Promise<ExternalProjectionReservation>;
  claim(projectionId: string): Promise<ExternalProjectionClaim>;
  markDelivered(input: {
    readonly projectionId: string;
    readonly fact: ExternalProjectionFact;
    readonly deliveredAt: string;
  }): Promise<void>;
  markRetryable(input: {
    readonly projectionId: string;
    readonly errorCode: "external-unavailable" | "protocol-invalid";
    readonly availableAt: string;
  }): Promise<void>;
}

/**
 * An acknowledgement is an observation only. It never establishes that the
 * corresponding run is executing; the reconciler must later obtain that fact
 * independently from worker/provider observations.
 */
export type ProviderAcknowledgement = {
  readonly jobId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly securityDomain: string;
  readonly workerId: string;
  readonly providerId: string;
  readonly providerSessionRef?: string;
  readonly acknowledgedAt: string;
};

export type ReconciliationSnapshot = {
  readonly taskId: string;
  readonly runId: string;
  readonly securityDomain: string;
  readonly desired: "running" | "paused" | "cancelled" | "complete";
  readonly observed: "running" | "paused" | "failed" | "cancelled" | "complete" | "unknown";
  readonly workerAvailable: boolean;
  readonly providerAvailable: boolean;
  /** Retained as evidence only; it must not alter `observed`. */
  readonly providerAcknowledged: boolean;
};

/**
 * The Coordinator's durable boundary. A concrete adapter may use the durable
 * database and transactional outbox, while deterministic tests use an in-memory
 * double. No chat or provider transport is given permission to bypass this
 * port.
 */
export interface CoordinatorDurableStore extends DurableOperationalStore {
  recordIntent(
    intent: CoordinatorIntent,
    options?: DurableOperationOptions,
  ): Promise<string>;
  recordSchedulingDecision(
    audit: SchedulingAuditRecord,
    options?: DurableOperationOptions,
  ): Promise<string>;
  createAttention(
    draft: AttentionDraft,
    options?: DurableOperationOptions,
  ): Promise<AttentionItem>;
  recordAttentionResponse(
    response: AttentionResponseRecord,
    options?: DurableOperationOptions,
  ): Promise<AttentionItem>;
  recordProviderAcknowledgement(
    acknowledgement: ProviderAcknowledgement,
    options?: DurableOperationOptions,
  ): Promise<string>;
  listReconciliationSnapshots(
    options?: DurableOperationOptions,
  ): Promise<readonly ReconciliationSnapshot[]>;
}

export type ReconciliationDecision =
  | { readonly kind: "no-change" }
  | {
    readonly kind: "attention-required";
    readonly reason:
      | "provider-unavailable"
      | "worker-unavailable"
      | "state-unknown"
      | "state-mismatch";
    readonly automaticallyRestart: false;
  };

export function reconcileObservedState(input: {
  readonly desired: "running" | "paused" | "cancelled" | "complete";
  readonly observed: "running" | "paused" | "failed" | "cancelled" | "complete" | "unknown";
  readonly workerAvailable: boolean;
  readonly providerAvailable: boolean;
}): ReconciliationDecision {
  if (!input.workerAvailable) {
    return { kind: "attention-required", reason: "worker-unavailable", automaticallyRestart: false };
  }
  if (!input.providerAvailable || input.observed === "failed") {
    return { kind: "attention-required", reason: "provider-unavailable", automaticallyRestart: false };
  }
  if (input.observed === "unknown") {
    return { kind: "attention-required", reason: "state-unknown", automaticallyRestart: false };
  }
  if (input.observed !== input.desired) {
    return { kind: "attention-required", reason: "state-mismatch", automaticallyRestart: false };
  }
  return { kind: "no-change" };
}

export type WorkerPreflightRejectionReason =
  | "worker-not-accepting"
  | "duplicate-job"
  | "incompatible-contract"
  | "security-domain-mismatch"
  | "policy-not-verified"
  | "signature-not-verified"
  | "lease-authority-not-verified"
  | "lease-expired"
  | "path-out-of-scope"
  | "missing-capability"
  | "missing-skill"
  | "missing-resource-budget"
  | "insufficient-disk"
  | "insufficient-memory"
  | "worktree-limit"
  | "job-capacity"
  | "runtime-limit";

export type WorkerPreflightFacts = {
  readonly mode: WorkerMode;
  readonly duplicateJob: boolean;
  readonly contractCompatible: boolean;
  readonly securityDomainMatches: boolean;
  readonly policyVerified: boolean;
  readonly signatureVerified: boolean;
  readonly leaseAuthorityVerified: boolean;
  readonly leaseExpiresAtEpochMs: number;
  readonly nowEpochMs: number;
  readonly pathAllowed: boolean;
  readonly missingCapabilities: readonly string[];
  readonly missingSkills: readonly string[];
  readonly budget: ResourceBudget | undefined;
  readonly resources: WorkerResourceSnapshot;
  readonly minimumFreeDiskBytes: number;
  readonly maximumActiveWorktrees: number;
  readonly maximumRunningJobs: number;
  readonly maximumRuntimeSeconds: number;
};

export type WorkerPreflightDecision =
  | { readonly accepted: true }
  | {
    readonly accepted: false;
    readonly reasons: readonly WorkerPreflightRejectionReason[];
  };

export function evaluateWorkerPreflight(
  facts: WorkerPreflightFacts,
): WorkerPreflightDecision {
  const reasons: WorkerPreflightRejectionReason[] = [];
  if (facts.mode === "draining" || facts.mode === "quarantined") {
    reasons.push("worker-not-accepting");
  }
  if (facts.duplicateJob) reasons.push("duplicate-job");
  if (!facts.contractCompatible) reasons.push("incompatible-contract");
  if (!facts.securityDomainMatches) reasons.push("security-domain-mismatch");
  if (!facts.policyVerified) reasons.push("policy-not-verified");
  if (!facts.signatureVerified) reasons.push("signature-not-verified");
  if (!facts.leaseAuthorityVerified) reasons.push("lease-authority-not-verified");
  if (
    !Number.isFinite(facts.leaseExpiresAtEpochMs)
    || facts.leaseExpiresAtEpochMs <= facts.nowEpochMs
  ) {
    reasons.push("lease-expired");
  }
  if (!facts.pathAllowed) reasons.push("path-out-of-scope");
  if (facts.missingCapabilities.length) reasons.push("missing-capability");
  if (facts.missingSkills.length) reasons.push("missing-skill");

  if (!facts.budget) {
    reasons.push("missing-resource-budget");
  } else {
    const requiredFreeDisk = Math.max(
      facts.minimumFreeDiskBytes,
      facts.budget.minimumFreeDiskBytes,
    );
    if (facts.resources.freeDiskBytes < requiredFreeDisk) {
      reasons.push("insufficient-disk");
    }
    if (facts.resources.availableMemoryBytes < facts.budget.memoryReservationBytes) {
      reasons.push("insufficient-memory");
    }
    if (
      facts.resources.activeWorktreeCount + facts.budget.worktreeSlots
      > facts.maximumActiveWorktrees
    ) {
      reasons.push("worktree-limit");
    }
    if (facts.budget.maximumRuntimeSeconds > facts.maximumRuntimeSeconds) {
      reasons.push("runtime-limit");
    }
  }
  if (facts.resources.runningJobCount >= facts.maximumRunningJobs) {
    reasons.push("job-capacity");
  }

  return reasons.length ? { accepted: false, reasons } : { accepted: true };
}

/**
 * Git-backed ADRs remain canonical. This port records a curation audit only;
 * it cannot create, amend, or approve an ADR or any other canonical record.
 */
export interface CuratedMemoryStore {
  recordCandidate(candidate: MemoryCandidate): Promise<void>;
  recordAcceptance(record: CuratedMemoryRecord): Promise<void>;
  recordSupersession(input: MemorySupersession): Promise<void>;
}

/**
 * An optional derived-memory backend such as a temporal graph. It is not a
 * system of record and must never be used to authorize or schedule work.
 */
export interface CuratedMemoryGraphPort {
  index(record: CuratedMemoryRecord): Promise<void>;
  retrieve(query: MemoryRetrievalQuery): Promise<readonly CuratedMemoryRecord[]>;
}

export type MemorySupersession = {
  readonly prior: CuratedMemoryRecord;
  readonly successor: CuratedMemoryRecord;
};

/**
 * Validates that a human-curated record narrows, rather than promotes, a
 * candidate. A worker is therefore allowed to propose a candidate but cannot
 * cause its own proposal to become an accepted memory record.
 */
export function assertCuratedMemoryLineage(input: {
  readonly candidate: MemoryCandidate;
  readonly record: CuratedMemoryRecord;
}): CuratedMemoryRecord {
  const { candidate, record } = input;
  if (record.candidateId !== candidate.id) {
    throw new Error("Curated memory record must retain its candidate identifier.");
  }
  if (record.securityDomain !== candidate.securityDomain) {
    throw new Error("Curated memory record and candidate must share a security domain.");
  }
  if (!candidate.sourceRefs.includes(record.source.sourceRef)) {
    throw new Error("Curated memory source must be present in the submitted candidate.");
  }
  const candidateRepositories = new Set(candidate.applicableRepositories);
  if (!record.applicableRepositories.every((repository) => candidateRepositories.has(repository))) {
    throw new Error("Curated memory record cannot broaden the candidate repository scope.");
  }
  if (record.state !== "accepted") {
    throw new Error("Initial curation must create an accepted memory record.");
  }
  return record;
}

/**
 * Supersession is append-only at the boundary: the prior record remains in
 * history with its source, rationale, validity closure, and successor link.
 */
export function assertMemorySupersession(input: MemorySupersession): MemorySupersession {
  const { prior, successor } = input;
  if (prior.state !== "superseded" || successor.state !== "accepted") {
    throw new Error("A supersession requires a closed prior record and an accepted successor.");
  }
  if (prior.securityDomain !== successor.securityDomain) {
    throw new Error("Superseded memory records must remain in one security domain.");
  }
  if (prior.supersededByMemoryId !== successor.id || successor.supersedesMemoryId !== prior.id) {
    throw new Error("Supersession records must link prior and successor in both directions.");
  }
  const priorValidTo = Date.parse(prior.validTo ?? "");
  const successorValidFrom = Date.parse(successor.validFrom);
  if (!Number.isFinite(priorValidTo) || !Number.isFinite(successorValidFrom) || priorValidTo > successorValidFrom) {
    throw new Error("Supersession must close prior validity no later than successor validity.");
  }
  return input;
}
