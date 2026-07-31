import {
  CONTRACT_VERSION,
  browserCapabilityDeclarationSchema,
  browserHumanConfirmationSchema,
  browserObservationEvidenceSchema,
  browserObservationRequestSchema,
  providerCapabilityManifestSchema,
  safetyAuditRecordSchema,
  type BrowserHumanConfirmation,
  type BrowserObservationEvidence,
  type BrowserObservationRequest,
  type ProviderCapabilityManifest,
  type SafetyAuditRecord,
  type SafetyFinding,
  type WorkerResourceSnapshot,
  workerResourceSnapshotSchema,
} from "@agent-ops/contracts";

export type BrowserObservationPolicyDecision = {
  readonly decision: "allow-human-observation" | "require-human-confirmation" | "block";
  readonly reason:
    | "human-observation-required"
    | "human-confirmation-required"
    | "target-domain-not-allowed"
    | "observation-control-not-declared"
    | "confirmation-control-not-declared"
    | "write-authority-observe-only"
    | "provider-not-human-observed"
    | "provider-must-not-execute";
  readonly execution: "not-executed";
};

export type BrowserConfirmationPolicyDecision = {
  readonly decision: "recorded" | "rejected" | "block";
  readonly reason:
    | "human-confirmation-recorded"
    | "human-confirmation-rejected"
    | "confirmation-not-required"
    | "confirmation-request-mismatch";
  readonly execution: "not-executed";
};

const hasBrowserControl = (
  manifest: ProviderCapabilityManifest,
  control: "observe" | "request-human-confirmation",
): boolean => manifest.browser?.supportedControls.includes(control) === true;

/**
 * Classifies a browser handoff. A positive decision authorizes only evidence
 * intake from a human; it never launches or manipulates a browser or desktop.
 */
export function evaluateBrowserObservationPolicy(input: {
  readonly manifest: ProviderCapabilityManifest;
  readonly request: BrowserObservationRequest;
}): BrowserObservationPolicyDecision {
  const manifest = providerCapabilityManifestSchema.parse(input.manifest);
  const request = browserObservationRequestSchema.parse(input.request);
  const browser = manifest.browser;
  if (!browser || browserCapabilityDeclarationSchema.safeParse(browser).success === false) {
    return { decision: "block", reason: "provider-not-human-observed", execution: "not-executed" };
  }
  if (manifest.executionMode !== "no-execution") {
    return { decision: "block", reason: "provider-must-not-execute", execution: "not-executed" };
  }
  if (!request.allowedDomains.includes(request.targetDomain)) {
    return { decision: "block", reason: "target-domain-not-allowed", execution: "not-executed" };
  }
  if (!hasBrowserControl(manifest, "observe")) {
    return { decision: "block", reason: "observation-control-not-declared", execution: "not-executed" };
  }
  if (request.requestedAction === "observe") {
    return { decision: "allow-human-observation", reason: "human-observation-required", execution: "not-executed" };
  }
  if (request.writeAuthority === "observe-only") {
    return { decision: "block", reason: "write-authority-observe-only", execution: "not-executed" };
  }
  if (!hasBrowserControl(manifest, "request-human-confirmation")) {
    return { decision: "block", reason: "confirmation-control-not-declared", execution: "not-executed" };
  }
  return { decision: "require-human-confirmation", reason: "human-confirmation-required", execution: "not-executed" };
}

/** Validates only the audit record for a human decision, never a browser write. */
export function evaluateBrowserHumanConfirmation(input: {
  readonly request: BrowserObservationRequest;
  readonly confirmation: BrowserHumanConfirmation;
}): BrowserConfirmationPolicyDecision {
  const request = browserObservationRequestSchema.parse(input.request);
  const confirmation = browserHumanConfirmationSchema.parse(input.confirmation);
  if (
    request.requestedAction !== "propose-write"
    || request.writeAuthority !== "human-confirmed-write"
  ) {
    return { decision: "block", reason: "confirmation-not-required", execution: "not-executed" };
  }
  if (
    confirmation.requestId !== request.requestId
    || confirmation.securityDomain !== request.securityDomain
    || confirmation.targetDomain !== request.targetDomain
  ) {
    return { decision: "block", reason: "confirmation-request-mismatch", execution: "not-executed" };
  }
  return confirmation.decision === "approved"
    ? { decision: "recorded", reason: "human-confirmation-recorded", execution: "not-executed" }
    : { decision: "rejected", reason: "human-confirmation-rejected", execution: "not-executed" };
}

/** Ensures a human-supplied summary is correlated and safe for durable evidence. */
export function assertRedactedBrowserEvidence(input: {
  readonly request: BrowserObservationRequest;
  readonly evidence: BrowserObservationEvidence;
}): BrowserObservationEvidence {
  const request = browserObservationRequestSchema.parse(input.request);
  const evidence = browserObservationEvidenceSchema.parse(input.evidence);
  if (evidence.requestId !== request.requestId || evidence.targetDomain !== request.targetDomain) {
    throw new Error("Redacted browser evidence must match the approved observation request.");
  }
  if (request.requestedAction === "observe" && evidence.classification !== "read-only-observation") {
    throw new Error("An observe-only browser request cannot record write-intent evidence.");
  }
  return evidence;
}

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
