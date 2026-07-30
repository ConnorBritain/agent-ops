import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateWorkerPreflight,
  reconcileObservedState,
  selectPlacement,
  type WorkerPreflightFacts,
} from "../src/index.ts";

describe("placement policy", () => {
  it("rejects domain mismatches before preference scoring", () => {
    const result = selectPlacement(
      {
        securityDomain: "domain-a",
        requiredCapabilities: ["terminal"],
        preferredProviderId: "preferred",
        policyDecision: {
          id: "policy-1",
          decision: "allow",
          securityDomain: "domain-a",
          rationale: "bounded test",
        },
      },
      [
        {
          workerId: "wrong-domain",
          providerId: "preferred",
          securityDomain: "domain-b",
          capabilities: new Set(["terminal"]),
          healthy: true,
          preferenceScore: 100,
        },
        {
          workerId: "eligible",
          providerId: "fallback",
          securityDomain: "domain-a",
          capabilities: new Set(["terminal"]),
          healthy: true,
          preferenceScore: 1,
        },
      ],
    );

    assert.equal(result.accepted, true);
    if (!result.accepted) return;
    assert.equal(result.selected.workerId, "eligible");
    assert.deepEqual(result.exclusions, [{
      workerId: "wrong-domain",
      reason: "security-domain-mismatch",
    }]);
  });

  it("never places work before an allow policy decision", () => {
    const result = selectPlacement(
      {
        securityDomain: "domain-a",
        requiredCapabilities: [],
        policyDecision: {
          id: "policy-1",
          decision: "requires-approval",
          securityDomain: "domain-a",
          rationale: "human decision required",
        },
      },
      [],
    );
    assert.deepEqual(result, {
      accepted: false,
      reason: "approval-required",
      exclusions: [],
    });
  });
});

describe("reconciliation", () => {
  it("turns provider loss into attention without automatic restart", () => {
    assert.deepEqual(
      reconcileObservedState({
        desired: "running",
        observed: "failed",
        workerAvailable: true,
        providerAvailable: false,
      }),
      {
        kind: "attention-required",
        reason: "provider-unavailable",
        automaticallyRestart: false,
      },
    );
  });

  it("turns desired/observed drift into attention without automatic restart", () => {
    assert.deepEqual(
      reconcileObservedState({
        desired: "cancelled",
        observed: "running",
        workerAvailable: true,
        providerAvailable: true,
      }),
      {
        kind: "attention-required",
        reason: "state-mismatch",
        automaticallyRestart: false,
      },
    );
  });
});

const validPreflightFacts = (): WorkerPreflightFacts => ({
  mode: "idle",
  duplicateJob: false,
  contractCompatible: true,
  securityDomainMatches: true,
  policyVerified: true,
  signatureVerified: true,
  leaseAuthorityVerified: true,
  leaseExpiresAtEpochMs: Date.parse("2026-07-30T04:05:00Z"),
  nowEpochMs: Date.parse("2026-07-30T04:00:00Z"),
  pathAllowed: true,
  missingCapabilities: [],
  missingSkills: [],
  budget: {
    minimumFreeDiskBytes: 10_000,
    memoryReservationBytes: 5_000,
    worktreeSlots: 1,
    maximumRuntimeSeconds: 900,
  },
  resources: {
    freeDiskBytes: 100_000,
    availableMemoryBytes: 50_000,
    activeWorktreeCount: 0,
    runningJobCount: 0,
  },
  minimumFreeDiskBytes: 20_000,
  maximumActiveWorktrees: 2,
  maximumRunningJobs: 1,
  maximumRuntimeSeconds: 1_800,
});

describe("worker preflight", () => {
  it("accepts a compatible, signed, leased job within resource limits", () => {
    assert.deepEqual(evaluateWorkerPreflight(validPreflightFacts()), {
      accepted: true,
    });
  });

  it("returns a deterministic rejection matrix before launch", () => {
    const result = evaluateWorkerPreflight({
      ...validPreflightFacts(),
      mode: "quarantined",
      contractCompatible: false,
      securityDomainMatches: false,
      policyVerified: false,
      signatureVerified: false,
      leaseAuthorityVerified: false,
      leaseExpiresAtEpochMs: Date.parse("2026-07-30T03:59:59Z"),
      pathAllowed: false,
      missingCapabilities: ["terminal"],
      missingSkills: ["repository-inspection"],
      budget: {
        minimumFreeDiskBytes: 10_000,
        memoryReservationBytes: 5_000,
        worktreeSlots: 1,
        maximumRuntimeSeconds: 3_600,
      },
      resources: {
        freeDiskBytes: 1,
        availableMemoryBytes: 1,
        activeWorktreeCount: 2,
        runningJobCount: 1,
      },
    });
    assert.deepEqual(result, {
      accepted: false,
      reasons: [
        "worker-not-accepting",
        "incompatible-contract",
        "security-domain-mismatch",
        "policy-not-verified",
        "signature-not-verified",
        "lease-authority-not-verified",
        "lease-expired",
        "path-out-of-scope",
        "missing-capability",
        "missing-skill",
        "insufficient-disk",
        "insufficient-memory",
        "worktree-limit",
        "runtime-limit",
        "job-capacity",
      ],
    });
  });

  it("rejects a missing resource budget and duplicate delivery", () => {
    assert.deepEqual(evaluateWorkerPreflight({
      ...validPreflightFacts(),
      duplicateJob: true,
      budget: undefined,
    }), {
      accepted: false,
      reasons: ["duplicate-job", "missing-resource-budget"],
    });
  });
});
