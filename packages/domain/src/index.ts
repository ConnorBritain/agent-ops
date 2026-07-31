import type {
  AttentionItem,
  Command,
  NormalizedEvent,
  ResourceBudget,
  SignedJobEnvelope,
  WorkerMode,
  WorkerResourceSnapshot,
} from "@agent-ops/contracts";

export type PolicyDecision = {
  readonly id: string;
  readonly decision: "allow" | "deny" | "requires-approval";
  readonly securityDomain: string;
  readonly rationale: string;
};

export type PlacementCandidate = {
  readonly workerId: string;
  readonly providerId: string;
  readonly securityDomain: string;
  readonly capabilities: ReadonlySet<string>;
  readonly healthy: boolean;
  readonly preferenceScore: number;
};

export type PlacementRequest = {
  readonly securityDomain: string;
  readonly requiredCapabilities: readonly string[];
  readonly preferredProviderId?: string;
  readonly policyDecision: PolicyDecision;
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
    rationale: `eligible after policy, domain, health, and capability filters; score=${selected.preferenceScore}`,
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
  readonly preferredProviderId?: string;
  readonly candidates: readonly {
    readonly workerId: string;
    readonly providerId: string;
    readonly securityDomain: string;
    readonly capabilities: readonly string[];
    readonly healthy: boolean;
    readonly preferenceScore: number;
  }[];
  readonly placement: PlacementResult;
  readonly recordedAt: string;
};

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
