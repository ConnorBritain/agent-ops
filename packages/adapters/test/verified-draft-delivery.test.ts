import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VerifiedDraftDeliveryService } from "../src/index.ts";
import {
  DeterministicClock,
  InMemoryDraftDeliveryStore,
  RecordingDraftPullRequestGateway,
  StaticDraftDeliveryPolicy,
  StaticIndependentVerifier,
  testIds,
} from "@agent-ops/test-kit";
import type { DraftPullRequestIntent, VerificationRecord } from "@agent-ops/contracts";
import type { PolicyDecision } from "@agent-ops/domain";

const intent = (): DraftPullRequestIntent => ({
  version: "1.0",
  deliveryId: testIds.delivery,
  idempotencyKey: "draft-delivery-fixture-001",
  taskId: testIds.task,
  runId: testIds.run,
  securityDomain: "example-domain",
  repositoryRef: "repo://fixture/reversible-change",
  headRef: "refs/heads/agentops/fixture-change",
  baseRef: "refs/heads/main",
  title: "Fixture reversible change",
  verificationId: testIds.verification,
  policyDecisionId: testIds.policy,
  draft: true,
  requestedAt: "2026-07-30T04:00:00Z",
});

const verification = (verdict: VerificationRecord["verdict"] = "pass"): VerificationRecord => ({
  version: "1.0",
  id: testIds.verification,
  taskId: testIds.task,
  runId: testIds.run,
  securityDomain: "example-domain",
  verifierId: "independent-fixture",
  verdict,
  summary: "The reversible fixture is independently verified.",
  implementationEvidenceRefs: ["evidence://fixture/reversible-change"],
  verifiedAt: "2026-07-30T04:00:00Z",
});

const policy = (decision: PolicyDecision["decision"] = "allow"): PolicyDecision => ({
  id: testIds.policy,
  decision,
  securityDomain: "example-domain",
  rationale: "bounded fixture policy",
});

const fixture = (overrides: {
  readonly verdict?: VerificationRecord["verdict"];
  readonly policyDecision?: PolicyDecision["decision"];
} = {}) => {
  const store = new InMemoryDraftDeliveryStore();
  const verifier = new StaticIndependentVerifier(verification(overrides.verdict));
  const deliveryPolicy = new StaticDraftDeliveryPolicy(policy(overrides.policyDecision));
  const gateway = new RecordingDraftPullRequestGateway();
  const calls: string[] = [];
  const service = new VerifiedDraftDeliveryService({
    clock: new DeterministicClock(),
    store,
    verifier: {
      async verify(input) {
        calls.push(`verify:${input.intent.runId}`);
        return verifier.verify();
      },
    },
    policy: {
      async evaluate(input) {
        calls.push(`policy:${input.verification.id}`);
        return deliveryPolicy.evaluate();
      },
    },
    gateway: {
      async createDraft(input) {
        calls.push(`draft:${input.idempotencyKey}`);
        return gateway.createDraft(input);
      },
    },
  });
  return { calls, deliveryPolicy, gateway, service, store, verifier };
};

describe("verified draft delivery", () => {
  it("persists independent verification and an allow gate before one draft-only delivery", async () => {
    const { calls, gateway, service, store, verifier } = fixture();
    const result = await service.deliver(intent());

    assert.deepEqual(result, {
      kind: "draft-created",
      verification: verification(),
      pullRequest: { draft: true, pullRequestRef: "draft-pr://fixture/reversible-change/1" },
    });
    assert.deepEqual(store.operations, [
      "delivery-reserve",
      "verification",
      "delivery-gate-allow",
      "delivery-complete",
    ]);
    assert.deepEqual(calls, [
      `verify:${testIds.run}`,
      `policy:${testIds.verification}`,
      "draft:draft-delivery-fixture-001",
    ]);
    assert.deepEqual(verifier.calls, ["independent-verifier"]);
    assert.equal(gateway.intents.length, 1);
  });

  it("replays a completed delivery without another verification, policy evaluation, or draft", async () => {
    const { calls, gateway, service, store, verifier } = fixture();
    const first = await service.deliver(intent());
    const replay = await service.deliver(intent());

    assert.deepEqual(replay, first);
    assert.equal(gateway.intents.length, 1);
    assert.deepEqual(verifier.calls, ["independent-verifier"]);
    assert.deepEqual(calls, [
      `verify:${testIds.run}`,
      `policy:${testIds.verification}`,
      "draft:draft-delivery-fixture-001",
    ]);
    assert.deepEqual(store.operations, [
      "delivery-reserve",
      "verification",
      "delivery-gate-allow",
      "delivery-complete",
      "delivery-reserve",
    ]);
  });

  it("blocks a draft when the independent verdict is not pass", async () => {
    const { deliveryPolicy, gateway, service, store } = fixture({ verdict: "fail" });
    const result = await service.deliver(intent());

    assert.equal(result.kind, "blocked-verification");
    assert.equal(gateway.intents.length, 0);
    assert.deepEqual(deliveryPolicy.calls, []);
    assert.deepEqual(store.operations, [
      "delivery-reserve",
      "verification",
      "delivery-gate-block",
      "delivery-complete",
    ]);
  });

  it("blocks a draft when a matching delivery policy does not allow it", async () => {
    const { gateway, service, store } = fixture({ policyDecision: "requires-approval" });
    const result = await service.deliver(intent());

    assert.equal(result.kind, "blocked-policy");
    assert.equal(gateway.intents.length, 0);
    assert.deepEqual(store.operations, [
      "delivery-reserve",
      "verification",
      "delivery-gate-block",
      "delivery-complete",
    ]);
  });

  it("leaves delivery incomplete when a gateway does not prove a safe draft reference", async () => {
    const { gateway, service, store } = fixture();
    gateway.result = { draft: true, pullRequestRef: "invalid-reference" };
    await assert.rejects(() => service.deliver(intent()), /safe draft pull-request reference/);
    assert.equal(store.completed.size, 0);
    assert.equal(gateway.intents.length, 1);
  });
});
