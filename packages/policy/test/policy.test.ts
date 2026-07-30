import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateWorkerSafety,
  guardDestructiveDelete,
  planDryRunCleanup,
  type WorkerSafetyPolicy,
} from "../src/index.ts";

const policy: WorkerSafetyPolicy = {
  version: "0.1.0",
  minimumFreeDiskBytes: 20_000,
  quarantineFreeDiskBytes: 5_000,
  maximumActiveWorktrees: 2,
  maximumRunningJobs: 1,
  maximumStaleSessionAgeMs: 60_000,
};

const healthySnapshot = {
  resources: {
    freeDiskBytes: 100_000,
    availableMemoryBytes: 50_000,
    activeWorktreeCount: 0,
    runningJobCount: 0,
  },
  sessions: [],
  processes: [],
  cleanupCandidates: [],
};

describe("destructive-delete guard", () => {
  it("intercepts recursive and broad targets until a recorded approval supplies explicit targets", () => {
    assert.deepEqual(guardDestructiveDelete({
      requestedTargets: [],
      recursive: false,
      recordedApproval: false,
      approvedExplicitTargets: [],
    }), {
      decision: "block",
      resolvedTargets: [],
      execution: "not-executed",
      reason: "explicit-targets-required",
    });

    assert.deepEqual(guardDestructiveDelete({
      requestedTargets: ["."],
      recursive: true,
      recordedApproval: false,
      approvedExplicitTargets: [],
    }), {
      decision: "require-approval",
      resolvedTargets: [],
      execution: "not-executed",
      reason: "approval-required",
    });

    assert.deepEqual(guardDestructiveDelete({
      requestedTargets: ["*"],
      recursive: false,
      recordedApproval: true,
      approvedExplicitTargets: ["/workspace/retired-worktree", "C:\\"],
    }), {
      decision: "block",
      resolvedTargets: [],
      execution: "not-executed",
      reason: "approved-targets-must-be-explicit",
    });

    assert.deepEqual(guardDestructiveDelete({
      requestedTargets: ["."],
      recursive: true,
      recordedApproval: true,
      approvedExplicitTargets: ["/workspace/retired-worktree"],
    }), {
      decision: "allow",
      resolvedTargets: ["/workspace/retired-worktree"],
      execution: "not-executed",
      reason: "explicit-targets",
    });
  });
});

describe("dry-run cleanup", () => {
  it("proposes only explicit inactive non-evidence targets and never executes cleanup", () => {
    assert.deepEqual(planDryRunCleanup([
      {
        target: "/workspace/retired-worktree",
        kind: "worktree",
        active: false,
        preservesEvidence: false,
      },
      {
        target: "/workspace/active-worktree",
        kind: "worktree",
        active: true,
        preservesEvidence: false,
      },
      {
        target: "/evidence/session-001",
        kind: "session-evidence",
        active: false,
        preservesEvidence: true,
      },
      {
        target: "*",
        kind: "temporary-data",
        active: false,
        preservesEvidence: false,
      },
    ]), {
      kind: "cleanup-proposal",
      mode: "dry-run",
      targets: ["/workspace/retired-worktree"],
      preservedTargets: [
        "*",
        "/evidence/session-001",
        "/workspace/active-worktree",
      ],
      evidencePreserved: true,
      outcome: "proposed",
    });
  });
});

describe("worker safety policy", () => {
  it("fails closed on a malformed collector snapshot", () => {
    assert.throws(() => evaluateWorkerSafety({
      policy,
      snapshot: {
        ...healthySnapshot,
        resources: {
          ...healthySnapshot.resources,
          freeDiskBytes: -1,
        },
      },
      nowEpochMs: Date.parse("2026-07-30T04:00:00Z"),
    }), /Too small/);
  });

  it("blocks and drains resource collapse before additional dispatch", () => {
    const audit = evaluateWorkerSafety({
      policy,
      snapshot: {
        ...healthySnapshot,
        resources: {
          ...healthySnapshot.resources,
          freeDiskBytes: 10_000,
          activeWorktreeCount: 3,
        },
      },
      nowEpochMs: Date.parse("2026-07-30T04:00:00Z"),
    });
    assert.equal(audit.decision, "block");
    assert.equal(audit.workerTransition, "drain");
    assert.deepEqual(audit.findings.map((finding) => finding.code), [
      "free-disk-low",
      "worktree-limit-exceeded",
    ]);
  });

  it("quarantines a critically low-disk worker", () => {
    const audit = evaluateWorkerSafety({
      policy,
      snapshot: {
        ...healthySnapshot,
        resources: { ...healthySnapshot.resources, freeDiskBytes: 4_999 },
      },
      nowEpochMs: Date.parse("2026-07-30T04:00:00Z"),
    });
    assert.equal(audit.decision, "quarantine-worker");
    assert.equal(audit.workerTransition, "quarantine");
  });

  it("records stale sessions and orphaned processes with a dry-run-only remediation", () => {
    const audit = evaluateWorkerSafety({
      policy,
      snapshot: {
        ...healthySnapshot,
        sessions: [{
          sessionId: "session-001",
          active: true,
          lastActivityEpochMs: Date.parse("2026-07-30T03:58:59Z"),
          evidenceTarget: "/evidence/session-001",
        }],
        processes: [{
          processId: "process-001",
          orphaned: true,
          evidenceTarget: "/evidence/process-001",
        }],
        cleanupCandidates: [{
          target: "/workspace/retired-worktree",
          kind: "worktree",
          active: false,
          preservesEvidence: false,
        }],
      },
      nowEpochMs: Date.parse("2026-07-30T04:00:00Z"),
    });
    assert.deepEqual(audit.findings.map((finding) => finding.code), [
      "stale-session",
      "orphaned-process",
    ]);
    assert.deepEqual(audit.remediation, {
      kind: "cleanup-proposal",
      mode: "dry-run",
      targets: ["/workspace/retired-worktree"],
      evidencePreserved: true,
      outcome: "proposed",
    });
  });
});
