import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CoordinatorRuntime,
  type AttentionDeliveryAttempt,
  type CoordinatorAttentionDelivery,
  type CoordinatorPolicyEngine,
  type CoordinatorRuntimePorts,
  type CoordinatorWorkerDispatch,
} from "../src/index.ts";
import {
  DeterministicClock,
  InMemoryCoordinatorDurableStore,
  buildJobEnvelope,
  testIds,
} from "@agent-ops/test-kit";
import type { AttentionItem, Command } from "@agent-ops/contracts";
import type { PlacementCandidate, PolicyDecision } from "@agent-ops/domain";

const dispatchCommand = (overrides: Partial<Command> = {}): Command => ({
  version: "1.0",
  idempotencyKey: "dispatch-fixture-001",
  actor: {
    id: testIds.principal,
    kind: "human",
    securityDomain: "example-domain",
  },
  source: { kind: "api", sourceId: "coordinator-fixture" },
  kind: "DispatchTask",
  target: { kind: "task", id: testIds.task },
  requiredCapabilities: ["terminal"],
  ...overrides,
});

const attentionCommand = (overrides: Partial<Command> = {}): Command => ({
  version: "1.0",
  idempotencyKey: "answer-attention-fixture-001",
  actor: {
    id: testIds.coordinator,
    kind: "coordinator",
    securityDomain: "example-domain",
  },
  source: { kind: "api", sourceId: "coordinator-fixture" },
  kind: "AnswerAttentionItem",
  target: { kind: "attention-item", id: testIds.attention },
  requiredCapabilities: [],
  ...overrides,
});

const candidate = (overrides: Partial<PlacementCandidate> = {}): PlacementCandidate => ({
  workerId: testIds.worker,
  providerId: "codex-app-server",
  securityDomain: "example-domain",
  capabilities: new Set(["terminal", "git"]),
  healthy: true,
  preferenceScore: 10,
  ...overrides,
});

class FixturePolicy implements CoordinatorPolicyEngine {
  readonly calls: string[];
  readonly decision: PolicyDecision;

  constructor(calls: string[], decision: PolicyDecision) {
    this.calls = calls;
    this.decision = decision;
  }

  async evaluate(): Promise<PolicyDecision> {
    this.calls.push("policy");
    return this.decision;
  }
}

class FixtureWorkerDispatch implements CoordinatorWorkerDispatch {
  readonly calls: string[];
  result: Awaited<ReturnType<CoordinatorWorkerDispatch["dispatch"]>> = {
    accepted: true,
    acknowledgement: {
      providerSessionRef: "provider-session:fixture",
      acknowledgedAt: "2026-07-30T04:00:00.000Z",
    },
  };

  constructor(calls: string[]) {
    this.calls = calls;
  }

  async dispatch(): Promise<Awaited<ReturnType<CoordinatorWorkerDispatch["dispatch"]>>> {
    this.calls.push("worker-dispatch");
    return this.result;
  }
}

class FixtureAttentionDelivery implements CoordinatorAttentionDelivery {
  readonly calls: string[];
  readonly store: InMemoryCoordinatorDurableStore;
  throwDelivery = false;

  constructor(calls: string[], store: InMemoryCoordinatorDurableStore) {
    this.calls = calls;
    this.store = store;
  }

  async deliver(attention: { readonly id: string }): Promise<AttentionDeliveryAttempt> {
    assert.ok(this.store.attentionItems.some((item) => item.id === attention.id));
    this.calls.push("attention-delivery");
    if (this.throwDelivery) throw new Error("transport unavailable");
    return { status: "delivered", deliveryReference: "projection:fixture" };
  }

  async deliverResponse(input: {
    readonly attention: AttentionItem;
    readonly response: Readonly<Record<string, unknown>>;
  }): Promise<AttentionDeliveryAttempt> {
    assert.ok(input.attention.durableResponse);
    this.calls.push("response-delivery");
    if (this.throwDelivery) throw new Error("transport unavailable");
    return { status: "delivered", deliveryReference: "session:fixture" };
  }
}

const runtimeFixture = (decision: PolicyDecision = {
  id: testIds.policy,
  decision: "allow",
  securityDomain: "example-domain",
  rationale: "bounded fixture",
}) => {
  const calls: string[] = [];
  const store = new InMemoryCoordinatorDurableStore();
  const workerDispatch = new FixtureWorkerDispatch(calls);
  const attentionDelivery = new FixtureAttentionDelivery(calls, store);
  const runtime = new CoordinatorRuntime({
    clock: new DeterministicClock(),
    store,
    policy: new FixturePolicy(calls, decision),
    workerDispatch,
    attentionDelivery,
  } satisfies CoordinatorRuntimePorts);
  return { runtime, calls, store, workerDispatch, attentionDelivery };
};

describe("Coordinator dispatch", () => {
  it("persists human/coordinator intent before policy, records a complete scheduling audit, and queues one durable job", async () => {
    const { runtime, calls, store } = runtimeFixture();
    const result = await runtime.dispatch({
      command: dispatchCommand(),
      envelope: buildJobEnvelope(),
      candidates: [
        candidate({ workerId: "wrong-domain", securityDomain: "other-domain", preferenceScore: 100 }),
        candidate(),
      ],
    });

    assert.deepEqual(result, {
      kind: "queued",
      jobId: testIds.job,
      workerId: testIds.worker,
      providerId: "codex-app-server",
      providerAcknowledged: true,
    });
    assert.deepEqual(store.operations, ["intent", "scheduling", "job", "provider-acknowledgement"]);
    assert.deepEqual(calls, ["policy", "worker-dispatch"]);
    assert.equal(store.intents.length, 1);
    assert.equal(store.jobs.length, 1);
    assert.deepEqual(store.schedulingDecisions[0]?.placement, {
      accepted: true,
      selected: candidate(),
      exclusions: [{ workerId: "wrong-domain", reason: "security-domain-mismatch" }],
      rationale: "eligible after policy, domain, health, and capability filters; score=10",
    });
    assert.equal(store.providerAcknowledgements.length, 1);
  });

  it("persists a denied placement audit and attention before attempting any worker dispatch", async () => {
    const { runtime, calls, store } = runtimeFixture({
      id: testIds.policy,
      decision: "requires-approval",
      securityDomain: "example-domain",
      rationale: "approval required",
    });
    const result = await runtime.dispatch({
      command: dispatchCommand(),
      envelope: buildJobEnvelope(),
      candidates: [candidate()],
    });

    assert.equal(result.kind, "attention-required");
    assert.equal(result.reason, "approval-required");
    assert.equal(result.delivery.status, "delivered");
    assert.deepEqual(store.operations, ["intent", "scheduling", "attention"]);
    assert.deepEqual(calls, ["policy", "attention-delivery"]);
    assert.equal(store.jobs.length, 0);
  });

  it("records a provider acknowledgement only as an observation and turns stale state into attention without a restart", async () => {
    const { runtime, calls, store } = runtimeFixture();
    await runtime.dispatch({
      command: dispatchCommand(),
      envelope: buildJobEnvelope(),
      candidates: [candidate()],
    });
    store.reconciliationSnapshots = [{
      taskId: testIds.task,
      runId: testIds.run,
      securityDomain: "example-domain",
      desired: "running",
      observed: "unknown",
      workerAvailable: true,
      providerAvailable: true,
      providerAcknowledged: true,
    }];

    const reconciliation = await runtime.reconcile();

    assert.equal(store.providerAcknowledgements.length, 1);
    assert.deepEqual(reconciliation.map((result) => result.decision), [{
      kind: "attention-required",
      reason: "state-unknown",
      automaticallyRestart: false,
    }]);
    assert.equal(store.jobs.length, 1);
    assert.deepEqual(calls, ["policy", "worker-dispatch", "attention-delivery"]);
    assert.equal(store.attentionItems.length, 1);
  });
});

describe("Coordinator attention", () => {
  it("persists an answer before delivery to a session projection", async () => {
    const { runtime, calls, store } = runtimeFixture({
      id: testIds.policy,
      decision: "requires-approval",
      securityDomain: "example-domain",
      rationale: "need operator response",
    });
    await runtime.dispatch({
      command: dispatchCommand(),
      envelope: buildJobEnvelope(),
      candidates: [candidate()],
    });
    const result = await runtime.answerAttention({
      command: attentionCommand(),
      response: { approval: "granted for bounded fixture" },
    });

    assert.equal(result.delivery.status, "delivered");
    assert.deepEqual(store.operations, ["intent", "scheduling", "attention", "attention-response"]);
    assert.deepEqual(calls, ["policy", "attention-delivery", "response-delivery"]);
    assert.deepEqual(store.attentionItems[0]?.durableResponse, {
      approval: "granted for bounded fixture",
    });
  });

  it("does not retry a failed attention projection and refuses inline secret-like answers", async () => {
    const { runtime, calls, store, attentionDelivery } = runtimeFixture({
      id: testIds.policy,
      decision: "requires-approval",
      securityDomain: "example-domain",
      rationale: "need operator response",
    });
    attentionDelivery.throwDelivery = true;
    const blocked = await runtime.dispatch({
      command: dispatchCommand(),
      envelope: buildJobEnvelope(),
      candidates: [candidate()],
    });
    assert.equal(blocked.kind, "attention-required");
    assert.equal(blocked.delivery.status, "deferred");
    assert.deepEqual(calls, ["policy", "attention-delivery"]);
    assert.equal(store.attentionItems.length, 1);
    await assert.rejects(
      runtime.answerAttention({
        command: attentionCommand(),
        response: { apiKey: "not-allowed" },
      }),
      /Inline secret rejected/,
    );
  });
});
