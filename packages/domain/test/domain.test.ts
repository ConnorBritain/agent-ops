import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertFinOpsLineage,
  assertReleaseRecoveryLineage,
  compatibilityVersionSatisfies,
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

const releaseRecoveryFixture = () => {
  const ids = {
    release: "00000000-0000-4000-8000-000000000301",
    manifest: "00000000-0000-4000-8000-000000000302",
    canary: "00000000-0000-4000-8000-000000000303",
    stable: "00000000-0000-4000-8000-000000000304",
    migration: "00000000-0000-4000-8000-000000000305",
    backup: "00000000-0000-4000-8000-000000000306",
    replacement: "00000000-0000-4000-8000-000000000307",
    retiredWorker: "00000000-0000-4000-8000-000000000308",
    replacementWorker: "00000000-0000-4000-8000-000000000309",
    ledgerOne: "00000000-0000-4000-8000-000000000310",
    ledgerTwo: "00000000-0000-4000-8000-000000000311",
    gate: "00000000-0000-4000-8000-000000000312",
    approver: "00000000-0000-4000-8000-000000000313",
  };
  const declarations = [
    "coordinator-api", "worker-runtime", "provider-sdk", "provider-adapter", "policy",
    "database-schema", "job-contract", "event-contract", "skill-bundle",
  ].map((component) => ({
    component,
    currentVersion: "1.1.0",
    acceptsVersionRange: ">=1.0.0 <2.0.0",
    backwardCompatibility: component === "database-schema"
      ? "requires-expand-migration"
      : "backward-compatible",
  }));
  const approval = {
    approvalRef: "approval://fixture/release-recovery",
    approvedBy: { id: ids.approver, kind: "human", securityDomain: "example-domain" },
    approvedAt: "2026-07-30T04:00:00Z",
  };
  const manifest = {
    version: "1.0",
    id: ids.manifest,
    releaseId: ids.release,
    releaseRef: "release://fixture/recovery-1",
    declarations,
    generatedAt: "2026-07-30T04:00:00Z",
  };
  const promotions = [
    {
      version: "1.0",
      id: ids.canary,
      releaseId: ids.release,
      compatibilityManifestId: ids.manifest,
      fromChannel: "development",
      toChannel: "canary",
      compatibilityCheck: {
        verdict: "passed",
        evidenceRefs: ["test://fixture/development-canary"],
        checkedAt: "2026-07-30T04:00:00Z",
      },
      approval,
      promotedAt: "2026-07-30T04:00:00Z",
    },
    {
      version: "1.0",
      id: ids.stable,
      releaseId: ids.release,
      compatibilityManifestId: ids.manifest,
      fromChannel: "canary",
      toChannel: "stable",
      compatibilityCheck: {
        verdict: "passed",
        evidenceRefs: ["test://fixture/canary-stable"],
        checkedAt: "2026-07-30T04:01:00Z",
      },
      approval,
      promotedAt: "2026-07-30T04:01:00Z",
    },
  ];
  const backup = {
    version: "1.0",
    id: ids.backup,
    releaseId: ids.release,
    backupRef: "backup://fixture/recovery-1",
    coverage: [
      "durable-operational-state",
      "versioned-configuration",
      "persistent-memory-data",
      "documented-secret-references",
    ],
    integrity: "verified",
    restoration: "verified",
    evidenceRefs: ["test://fixture/backup-restore"],
    verifiedAt: "2026-07-30T04:00:00Z",
  };
  const migrations = [{
    version: "1.0",
    id: ids.migration,
    releaseId: ids.release,
    migrationRef: "migration://fixture/expand-contract-1",
    sourceSchemaVersion: "1.0.0",
    targetSchemaVersion: "1.1.0",
    appendOnly: true,
    strategy: "expand-before-contract",
    operation: "destructive",
    backupVerificationId: ids.backup,
    approval,
    forwardRepairRunbookRef: "runbook://release-recovery/forward-repair",
    gatedAt: "2026-07-30T04:00:00Z",
  }];
  const replacement = {
    version: "1.0",
    id: ids.replacement,
    releaseId: ids.release,
    retiredWorkerId: ids.retiredWorker,
    replacementWorkerId: ids.replacementWorker,
    durableLedger: {
      ledgerRef: "ledger://fixture/task-run-event",
      immutableRecordIds: [ids.ledgerOne, ids.ledgerTwo],
    },
    restoredLedgerRecordIds: [ids.ledgerTwo, ids.ledgerOne],
    enrollment: {
      bootstrap: true,
      registration: true,
      validation: true,
      provisioning: true,
      health: true,
      controlledDrain: true,
    },
    rehearsedAt: "2026-07-30T04:00:00Z",
  };
  const gate = {
    version: "1.0",
    id: ids.gate,
    releaseId: ids.release,
    compatibilityManifestId: ids.manifest,
    promotionIds: [ids.canary, ids.stable],
    migrationGateIds: [ids.migration],
    backupVerificationId: ids.backup,
    replacementRecordId: ids.replacement,
    redactionVerification: "passed",
    criticalSafetyTests: [{
      id: "safety-fixture",
      status: "passed",
      evidenceRefs: ["test://fixture/safety"],
    }],
    verdict: "passed",
    checkedAt: "2026-07-30T04:01:00Z",
  };
  return {
    manifest,
    observations: declarations.map(({ component, currentVersion }) => ({
      component,
      version: currentVersion,
    })),
    promotions,
    migrations,
    backups: [backup],
    replacement,
    gate,
  };
};

describe("release recovery lineage", () => {
  it("requires explicit compatible development-to-canary-to-stable promotion and full recovery evidence", () => {
    const fixture = releaseRecoveryFixture();
    assert.equal(
      assertReleaseRecoveryLineage(fixture as never).gate.verdict,
      "passed",
    );
    assert.equal(compatibilityVersionSatisfies("1.4.0", ">=1.0.0 <2.0.0"), true);
    assert.equal(compatibilityVersionSatisfies("2.0.0", ">=1.0.0 <2.0.0"), false);
  });

  it("blocks schema incompatibility, incomplete backups, ledger loss, failed redaction, and unaddressed safety", () => {
    const incompatible = releaseRecoveryFixture();
    incompatible.observations[6] = { component: "job-contract", version: "2.0.0" };
    assert.throws(() => assertReleaseRecoveryLineage(incompatible as never), /Incompatible job-contract/);

    const backupFailure = releaseRecoveryFixture();
    backupFailure.backups[0]!.restoration = "not-verified";
    assert.throws(() => assertReleaseRecoveryLineage(backupFailure as never), /verified, restoration-tested full backup/);

    const lostLedger = releaseRecoveryFixture();
    lostLedger.replacement.restoredLedgerRecordIds = [lostLedger.replacement.durableLedger.immutableRecordIds[0]!];
    assert.throws(() => assertReleaseRecoveryLineage(lostLedger as never), /did not preserve the durable ledger/);

    const redactionFailure = releaseRecoveryFixture();
    redactionFailure.gate.redactionVerification = "failed";
    assert.throws(() => assertReleaseRecoveryLineage(redactionFailure as never), /failed redaction/);

    const safetyFailure = releaseRecoveryFixture();
    safetyFailure.gate.criticalSafetyTests[0]!.status = "unaddressed";
    assert.throws(() => assertReleaseRecoveryLineage(safetyFailure as never), /unaddressed critical safety/);
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
