import {
  CONTRACT_VERSION,
  safetyAuditRecordSchema,
  type SafetyAuditRecord,
  type SafetyFinding,
  type WorkerResourceSnapshot,
  workerResourceSnapshotSchema,
} from "@agent-ops/contracts";

export type WorkerSafetyPolicy = {
  readonly version: string;
  readonly minimumFreeDiskBytes: number;
  readonly quarantineFreeDiskBytes: number;
  readonly maximumActiveWorktrees: number;
  readonly maximumRunningJobs: number;
  readonly maximumStaleSessionAgeMs: number;
};

export type SafetySessionObservation = {
  readonly sessionId: string;
  readonly lastActivityEpochMs: number;
  readonly active: boolean;
  readonly evidenceTarget: string;
};

export type SafetyProcessObservation = {
  readonly processId: string;
  readonly orphaned: boolean;
  readonly evidenceTarget: string;
};

export type CleanupCandidate = {
  readonly target: string;
  readonly kind: "worktree" | "log" | "temporary-data" | "session-evidence";
  readonly active: boolean;
  readonly preservesEvidence: boolean;
};

export type WorkerSafetySnapshot = {
  readonly resources: WorkerResourceSnapshot;
  readonly sessions: readonly SafetySessionObservation[];
  readonly processes: readonly SafetyProcessObservation[];
  readonly cleanupCandidates: readonly CleanupCandidate[];
};

export type DryRunCleanupPlan = {
  readonly kind: "cleanup-proposal";
  readonly mode: "dry-run";
  readonly targets: readonly string[];
  readonly preservedTargets: readonly string[];
  readonly evidencePreserved: true;
  readonly outcome: "proposed" | "not-needed";
};

export type DeleteGuardInput = {
  readonly requestedTargets: readonly string[];
  readonly recursive: boolean;
  readonly recordedApproval: boolean;
  readonly approvedExplicitTargets: readonly string[];
};

export type DeleteGuardResult = {
  readonly decision: "allow" | "block" | "require-approval";
  readonly resolvedTargets: readonly string[];
  readonly execution: "not-executed";
  readonly reason:
    | "explicit-targets"
    | "explicit-targets-required"
    | "approval-required"
    | "approved-targets-must-be-explicit";
};

const isBoundedInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;

const assertPolicy = (policy: WorkerSafetyPolicy): void => {
  const values = [
    policy.minimumFreeDiskBytes,
    policy.quarantineFreeDiskBytes,
    policy.maximumActiveWorktrees,
    policy.maximumRunningJobs,
    policy.maximumStaleSessionAgeMs,
  ];
  if (!values.every(isBoundedInteger) || policy.maximumRunningJobs < 1) {
    throw new Error("Worker safety policy limits must be bounded safe integers.");
  }
  if (policy.quarantineFreeDiskBytes > policy.minimumFreeDiskBytes) {
    throw new Error("quarantineFreeDiskBytes cannot exceed minimumFreeDiskBytes.");
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(policy.version)) {
    throw new Error("Worker safety policy version must be semantic.");
  }
};

const assertSnapshot = (snapshot: WorkerSafetySnapshot): WorkerResourceSnapshot => {
  const resources = workerResourceSnapshotSchema.parse(snapshot.resources);
  for (const session of snapshot.sessions) {
    if (
      !session.sessionId
      || !session.evidenceTarget
      || !Number.isSafeInteger(session.lastActivityEpochMs)
      || session.lastActivityEpochMs < 0
      || typeof session.active !== "boolean"
    ) {
      throw new Error("Safety session observations must be complete and bounded.");
    }
  }
  for (const process of snapshot.processes) {
    if (
      !process.processId
      || !process.evidenceTarget
      || typeof process.orphaned !== "boolean"
    ) {
      throw new Error("Safety process observations must be complete and bounded.");
    }
  }
  for (const candidate of snapshot.cleanupCandidates) {
    if (
      !candidate.target
      || !["worktree", "log", "temporary-data", "session-evidence"].includes(candidate.kind)
      || typeof candidate.active !== "boolean"
      || typeof candidate.preservesEvidence !== "boolean"
    ) {
      throw new Error("Safety cleanup candidates must be complete and bounded.");
    }
  }
  return resources;
};

const isExplicitTarget = (target: string): boolean => {
  const normalized = target.trim();
  if (!normalized || [".", "..", "/", "~"].includes(normalized)) return false;
  const slashNormalized = normalized.replaceAll("\\", "/");
  if (
    /^[A-Za-z]:[\\/]?$/.test(normalized)
    || /^\/\/[^/]+\/[^/]+\/?$/.test(slashNormalized)
    || slashNormalized.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return false;
  }
  return !/[\u0000*?\[\]{}]/.test(normalized);
};

const isBroadTarget = (target: string): boolean => !isExplicitTarget(target);

const sortedUnique = (values: readonly string[]): string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

export function guardDestructiveDelete(input: DeleteGuardInput): DeleteGuardResult {
  if (input.requestedTargets.length === 0) {
    return {
      decision: "block",
      resolvedTargets: [],
      execution: "not-executed",
      reason: "explicit-targets-required",
    };
  }
  const requestedIsRisky = input.recursive || input.requestedTargets.some(isBroadTarget);
  if (!requestedIsRisky) {
    return {
      decision: "allow",
      resolvedTargets: sortedUnique(input.requestedTargets),
      execution: "not-executed",
      reason: "explicit-targets",
    };
  }
  if (!input.recordedApproval) {
    return {
      decision: "require-approval",
      resolvedTargets: [],
      execution: "not-executed",
      reason: "approval-required",
    };
  }
  if (
    input.approvedExplicitTargets.length === 0
    || input.approvedExplicitTargets.some(isBroadTarget)
  ) {
    return {
      decision: "block",
      resolvedTargets: [],
      execution: "not-executed",
      reason: "approved-targets-must-be-explicit",
    };
  }
  return {
    decision: "allow",
    resolvedTargets: sortedUnique(input.approvedExplicitTargets),
    execution: "not-executed",
    reason: "explicit-targets",
  };
}

export function planDryRunCleanup(
  candidates: readonly CleanupCandidate[],
): DryRunCleanupPlan {
  const targets: string[] = [];
  const preservedTargets: string[] = [];
  for (const candidate of candidates) {
    if (
      candidate.active
      || candidate.preservesEvidence
      || !isExplicitTarget(candidate.target)
    ) {
      preservedTargets.push(candidate.target);
    } else {
      targets.push(candidate.target);
    }
  }
  const sortedTargets = sortedUnique(targets);
  return {
    kind: "cleanup-proposal",
    mode: "dry-run",
    targets: sortedTargets,
    preservedTargets: sortedUnique(preservedTargets),
    evidencePreserved: true,
    outcome: sortedTargets.length ? "proposed" : "not-needed",
  };
}

const resourceFinding = (
  code: string,
  severity: "warning" | "critical",
  evidence: Readonly<Record<string, unknown>>,
): SafetyFinding => ({ code, severity, evidence });

export function evaluateWorkerSafety(input: {
  readonly policy: WorkerSafetyPolicy;
  readonly snapshot: WorkerSafetySnapshot;
  readonly nowEpochMs: number;
}): SafetyAuditRecord {
  assertPolicy(input.policy);
  if (!Number.isSafeInteger(input.nowEpochMs) || input.nowEpochMs < 0) {
    throw new Error("Safety evaluation requires a bounded epoch timestamp.");
  }

  const { policy, snapshot } = input;
  const resources = assertSnapshot(snapshot);
  const findings: SafetyFinding[] = [];
  let quarantine = false;
  let drain = false;

  if (resources.freeDiskBytes < policy.quarantineFreeDiskBytes) {
    findings.push(resourceFinding("free-disk-critical", "critical", {
      freeDiskBytes: resources.freeDiskBytes,
      quarantineFreeDiskBytes: policy.quarantineFreeDiskBytes,
    }));
    quarantine = true;
  } else if (resources.freeDiskBytes < policy.minimumFreeDiskBytes) {
    findings.push(resourceFinding("free-disk-low", "critical", {
      freeDiskBytes: resources.freeDiskBytes,
      minimumFreeDiskBytes: policy.minimumFreeDiskBytes,
    }));
    drain = true;
  }
  if (resources.activeWorktreeCount > policy.maximumActiveWorktrees) {
    findings.push(resourceFinding("worktree-limit-exceeded", "critical", {
      activeWorktreeCount: resources.activeWorktreeCount,
      maximumActiveWorktrees: policy.maximumActiveWorktrees,
    }));
    drain = true;
  }
  if (resources.runningJobCount > policy.maximumRunningJobs) {
    findings.push(resourceFinding("job-capacity-exceeded", "critical", {
      runningJobCount: resources.runningJobCount,
      maximumRunningJobs: policy.maximumRunningJobs,
    }));
    drain = true;
  }

  for (const session of snapshot.sessions) {
    if (input.nowEpochMs - session.lastActivityEpochMs >= policy.maximumStaleSessionAgeMs) {
      findings.push({
        code: "stale-session",
        severity: "warning",
        evidence: {
          sessionId: session.sessionId,
          active: session.active,
          lastActivityEpochMs: session.lastActivityEpochMs,
          evidenceTarget: session.evidenceTarget,
        },
      });
    }
  }
  for (const process of snapshot.processes) {
    if (process.orphaned) {
      findings.push({
        code: "orphaned-process",
        severity: "warning",
        evidence: {
          processId: process.processId,
          evidenceTarget: process.evidenceTarget,
        },
      });
    }
  }

  const cleanup = planDryRunCleanup(snapshot.cleanupCandidates);
  const remediation: SafetyAuditRecord["remediation"] = findings.length === 0
    ? {
      kind: "none" as const,
      mode: "none" as const,
      targets: [],
      evidencePreserved: true,
      outcome: "not-needed" as const,
    }
    : {
      kind: "cleanup-proposal" as const,
      mode: "dry-run" as const,
      targets: [...cleanup.targets],
      evidencePreserved: cleanup.evidencePreserved,
      outcome: cleanup.outcome,
    };

  const audit: SafetyAuditRecord = quarantine
    ? {
      version: CONTRACT_VERSION,
      policyVersion: policy.version,
      decision: "quarantine-worker",
      workerTransition: "quarantine",
      findings,
      remediation,
    }
    : drain
      ? {
        version: CONTRACT_VERSION,
        policyVersion: policy.version,
        decision: "block",
        workerTransition: "drain",
        findings,
        remediation,
      }
      : findings.length
        ? {
          version: CONTRACT_VERSION,
          policyVersion: policy.version,
          decision: "remediate",
          workerTransition: "none",
          findings,
          remediation,
        }
        : {
          version: CONTRACT_VERSION,
          policyVersion: policy.version,
          decision: "allow",
          workerTransition: "none",
          findings: [],
          remediation,
        };

  return safetyAuditRecordSchema.parse(audit);
}
