import type { NormalizedEvent, SignedJobEnvelope } from "@agent-ops/contracts";

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

export interface DurableOperationalStore {
  acquireCoordinatorLease(input: {
    readonly leaseName: string;
    readonly holderPrincipalId: string;
    readonly ttlSeconds: number;
  }): Promise<LeaseGrant>;
  createJob(input: CreateJobInput): Promise<string>;
  recordWorkerEvent(event: NormalizedEvent): Promise<string>;
}

export type ReconciliationDecision =
  | { readonly kind: "no-change" }
  | {
    readonly kind: "attention-required";
    readonly reason: "provider-unavailable" | "worker-unavailable" | "state-unknown";
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
  return { kind: "no-change" };
}
