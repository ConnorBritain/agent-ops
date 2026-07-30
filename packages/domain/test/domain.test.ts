import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcileObservedState, selectPlacement } from "../src/index.ts";

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
