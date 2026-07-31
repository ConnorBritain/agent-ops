import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertFinOpsLineage,
  evaluateWorkerPreflight,
  reconcileObservedState,
  selectPlacement,
  skillVersionSatisfies,
  type WorkerPreflightFacts,
} from "../src/index.ts";

describe("placement policy", () => {
  it("rejects domain mismatches before preference scoring", () => {
    const result = selectPlacement(
      {
        securityDomain: "domain-a",
        requiredCapabilities: ["terminal"],
        requiredSkills: [],
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
          skills: [],
          healthy: true,
          preferenceScore: 100,
        },
        {
          workerId: "eligible",
          providerId: "fallback",
          securityDomain: "domain-a",
          capabilities: new Set(["terminal"]),
          skills: [],
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
        requiredSkills: [],
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

  it("requires an installed, version-compatible primitive for each enforced skill", () => {
    const request = {
      securityDomain: "domain-a",
      requiredCapabilities: ["terminal"],
      requiredSkills: [{ key: "repository-inspection", versionRange: "^1", enforcement: "enforced" as const }],
      policyDecision: {
        id: "policy-1",
        decision: "allow" as const,
        securityDomain: "domain-a",
        rationale: "bounded test",
      },
    };
    const result = selectPlacement(request, [{
      workerId: "worker-1",
      providerId: "provider-1",
      securityDomain: "domain-a",
      capabilities: new Set(["terminal"]),
      skills: [{ key: "repository-inspection", version: "1.2.0", bundleId: "core" }],
      healthy: true,
      preferenceScore: 1,
    }]);
    assert.equal(result.accepted, true);
    assert.equal(skillVersionSatisfies("1.2.0", "^1"), true);
    assert.equal(skillVersionSatisfies("0.9.0", "^1"), false);
    assert.equal(skillVersionSatisfies("0.1.4", "^0.1"), true);
    assert.equal(skillVersionSatisfies("0.2.0", "^0.1"), false);
    assert.equal(skillVersionSatisfies("1.3.0", "~1"), true);
  });
});

describe("FinOps lineage", () => {
  it("requires rate-card allocation lineage without converting planning points to money", () => {
    const estimate = {
      id: "00000000-0000-4000-8000-000000000001",
      taskId: "00000000-0000-4000-8000-000000000002",
      runId: "00000000-0000-4000-8000-000000000003",
      securityDomain: "domain-a",
    };
    const effort = [{
      id: "00000000-0000-4000-8000-000000000004",
      taskId: estimate.taskId,
      runId: estimate.runId,
      securityDomain: estimate.securityDomain,
      measure: "agent-execution" as const,
    }];
    const rateCard = {
      id: "00000000-0000-4000-8000-000000000005",
      rateCardVersion: "1.0.0",
      entries: [{ key: "compute", unit: "second", amount: 1, currency: "USD" }],
    };
    const allocation = {
      id: "00000000-0000-4000-8000-000000000006",
      taskId: estimate.taskId,
      runId: estimate.runId,
      securityDomain: estimate.securityDomain,
      rateCardId: rateCard.id,
      rateCardVersion: rateCard.rateCardVersion,
      rateKey: "compute",
      unit: "second",
      currency: "USD",
    };
    const feedback = {
      taskId: estimate.taskId,
      runId: estimate.runId,
      securityDomain: estimate.securityDomain,
      estimateId: estimate.id,
      effortMeasurementIds: [effort[0]!.id],
      allocationIds: [allocation.id],
    };
    assert.equal(assertFinOpsLineage({
      estimate: estimate as never,
      effort: effort as never,
      rateCards: [rateCard] as never,
      allocations: [allocation] as never,
      planningFeedback: feedback as never,
    }).estimate.id, estimate.id);
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
