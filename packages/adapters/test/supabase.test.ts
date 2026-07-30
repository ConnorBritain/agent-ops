import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONTRACT_VERSION } from "@agent-ops/contracts";
import {
  DurableStoreError,
  RoadmapAdapterError,
  RoadmapMcpReadTransport,
  RoadmapReadAdapter,
  SupabaseDurableOperationalStore,
  type RpcOptions,
  type RpcTransport,
} from "../src/index.ts";
import { StaticRoadmapReadTransport } from "@agent-ops/test-kit";

const coordinatorId = "00000000-0000-4000-8000-000000000001";
const roadmapRequest = {
  version: CONTRACT_VERSION,
  correlationId: "00000000-0000-4000-8000-000000000011",
  taskId: "00000000-0000-4000-8000-000000000012",
  runId: "00000000-0000-4000-8000-000000000013",
  securityDomain: "example-domain",
  sliceKey: "roadmap-adapter",
  requestedAt: "2026-07-30T05:00:00Z",
} as const;

const roadmapPlan = (firstWave: readonly Record<string, unknown>[]) => ({
  waves: [firstWave, [{
    invoke: "print-provider",
    pi: "phase-4-roadmap",
    sprint: "print-provider",
    status: "scheduled",
    branch: "phase-4-roadmap/print-provider",
    worktree: "/workspace/agent-ops/worktrees/print-provider",
    what: "No-execution provider reference",
    suggestedConcurrency: 1,
  }]],
});

const readyRoadmapSlice = {
  invoke: "roadmap-adapter",
  pi: "phase-4-roadmap",
  sprint: "roadmap-adapter",
  status: "scheduled",
  branch: "phase-4-roadmap/roadmap-adapter",
  worktree: "/workspace/agent-ops/worktrees/roadmap-adapter",
  what: "Typed Roadmap adapter",
  suggestedConcurrency: 1,
};

describe("Adapter boundaries", () => {
  it("maps the database lease result without exposing transport details", async () => {
    const transport: RpcTransport = {
      async rpc<T>() {
        return {
          data: [{
            acquired: true,
            lease_name: "primary-coordinator",
            holder_principal_id: coordinatorId,
            fencing_token: 7,
            expires_at: "2026-07-30T05:00:00Z",
          }] as T,
          error: null,
        };
      },
    };
    const store = new SupabaseDurableOperationalStore(transport);
    const lease = await store.acquireCoordinatorLease({
      leaseName: "primary-coordinator",
      holderPrincipalId: coordinatorId,
      ttlSeconds: 30,
    });
    assert.equal(lease.fencingToken, 7);
  });

  it("rejects an inline secret before sending a job RPC", async () => {
    let called = false;
    const transport: RpcTransport = {
      async rpc<T>() {
        called = true;
        return { data: null as T, error: null };
      },
    };
    const store = new SupabaseDurableOperationalStore(transport);
    const envelope = {
      version: CONTRACT_VERSION,
      jobId: "00000000-0000-4000-8000-000000000002",
      taskId: "00000000-0000-4000-8000-000000000003",
      runId: "00000000-0000-4000-8000-000000000004",
      securityDomain: "example-domain",
      requiredCapabilities: [],
      requiredSkills: [],
      policyDecisionId: "00000000-0000-4000-8000-000000000005",
      lease: {
        leaseName: "primary-coordinator",
        holderId: coordinatorId,
        fencingToken: 1,
        expiresAt: "2026-07-30T05:00:00Z",
      },
      safeWorkingDirectory: "/workspace/example",
      redactionPolicyRef: "policy://redaction/default",
      callbackIdentityRef: "secret://agentops/callback/worker",
      body: { password: "inline" },
      signature: {
        algorithm: "ed25519" as const,
        keyRef: "secret://agentops/signing/coordinator",
        value: "a".repeat(64),
      },
    };
    await assert.rejects(
      () => store.createJob({
        envelope,
        workerId: "00000000-0000-4000-8000-000000000006",
        providerId: "00000000-0000-4000-8000-000000000007",
        idempotencyKey: "job-attempt-1",
      }),
    );
    assert.equal(called, false);
  });

  it("redacts remote error messages from thrown adapter errors", async () => {
    const transport: RpcTransport = {
      async rpc<T>() {
        return {
          data: null as T,
          error: { code: "40001", message: "sensitive remote detail" },
        };
      },
    };
    const store = new SupabaseDurableOperationalStore(transport);
    await assert.rejects(
      () => store.acquireCoordinatorLease({
        leaseName: "primary-coordinator",
        holderPrincipalId: coordinatorId,
        ttlSeconds: 30,
      }),
      (error: unknown) => {
        assert.ok(error instanceof DurableStoreError);
        assert.equal(error.message.includes("sensitive remote detail"), false);
        return true;
      },
    );
  });

  it("threads caller cancellation through every bounded RPC", async () => {
    const controller = new AbortController();
    controller.abort(new Error("operator cancelled"));
    const transport: RpcTransport = {
      async rpc<T>(
        _functionName: string,
        _arguments: Readonly<Record<string, unknown>>,
        options: RpcOptions,
      ) {
        options.signal.throwIfAborted();
        return { data: null as T, error: null };
      },
    };
    const store = new SupabaseDurableOperationalStore(transport);
    await assert.rejects(
      () => store.acquireCoordinatorLease({
        leaseName: "primary-coordinator",
        holderPrincipalId: coordinatorId,
        ttlSeconds: 30,
      }, { signal: controller.signal }),
      /operator cancelled/,
    );
  });

  it("asks Roadmap for the current wave and slice gate while retaining stable correlation", async () => {
    const transport = new StaticRoadmapReadTransport(
      roadmapPlan([readyRoadmapSlice]),
      {
        "roadmap-adapter": {
          invoke: "roadmap-adapter",
          pi: "phase-4-roadmap",
          sprint: "roadmap-adapter",
          status: "scheduled",
          gate: "Roadmap adapter scenario and correlation contract tests",
          gatedOn: null,
        },
      },
    );
    const adapter = new RoadmapReadAdapter(transport);

    const intent = await adapter.resolveWorktreeIntent(roadmapRequest);

    assert.equal(intent.correlationId, roadmapRequest.correlationId);
    assert.equal(intent.taskId, roadmapRequest.taskId);
    assert.equal(intent.runId, roadmapRequest.runId);
    assert.equal(intent.slice.key, "roadmap-adapter");
    assert.equal(intent.worktree.reference, readyRoadmapSlice.worktree);
    assert.equal(intent.worktree.preparation, "not-started");
    assert.deepEqual(transport.calls, [
      { method: "plan" },
      { method: "show", invoke: "roadmap-adapter" },
    ]);
  });

  it("refuses a slice outside Roadmap's current ready wave without attempting preparation", async () => {
    const transport = new StaticRoadmapReadTransport(
      roadmapPlan([]),
      { "roadmap-adapter": readyRoadmapSlice },
    );
    const adapter = new RoadmapReadAdapter(transport);

    await assert.rejects(
      () => adapter.resolveWorktreeIntent(roadmapRequest),
      (error: unknown) => error instanceof RoadmapAdapterError && error.code === "SLICE_NOT_READY",
    );
    assert.deepEqual(transport.calls, [{ method: "plan" }]);
  });

  it("fails closed on a Roadmap gate, a mismatched detail, or secret-like external output", async () => {
    const gated = new StaticRoadmapReadTransport(
      roadmapPlan([readyRoadmapSlice]),
      {
        "roadmap-adapter": {
          ...readyRoadmapSlice,
          gate: "Private enrollment authorization",
          gatedOn: "explicit owner authorization",
        },
      },
    );
    await assert.rejects(
      () => new RoadmapReadAdapter(gated).resolveWorktreeIntent(roadmapRequest),
      (error: unknown) => error instanceof RoadmapAdapterError && error.code === "GATED_SLICE",
    );

    const mismatched = new StaticRoadmapReadTransport(
      roadmapPlan([readyRoadmapSlice]),
      {
        "roadmap-adapter": {
          ...readyRoadmapSlice,
          invoke: "print-provider",
          gate: "Correlation contract test",
          gatedOn: null,
        },
      },
    );
    await assert.rejects(
      () => new RoadmapReadAdapter(mismatched).resolveWorktreeIntent(roadmapRequest),
      (error: unknown) => error instanceof RoadmapAdapterError && error.code === "MISMATCHED_SLICE",
    );

    const unsafe = new StaticRoadmapReadTransport(
      roadmapPlan([{ ...readyRoadmapSlice, callbackToken: "inline-value" }]),
      { "roadmap-adapter": readyRoadmapSlice },
    );
    await assert.rejects(
      () => new RoadmapReadAdapter(unsafe).resolveWorktreeIntent(roadmapRequest),
      /Inline secret rejected/,
    );
  });

  it("maps only Roadmap's read-only MCP tools and preserves cancellation", async () => {
    const calls: { name: string; input: Readonly<Record<string, unknown>> }[] = [];
    const transport = new RoadmapMcpReadTransport({
      async callTool(name, input, options) {
        options?.signal?.throwIfAborted();
        calls.push({ name, input });
        return name === "plan" ? roadmapPlan([readyRoadmapSlice]) : {
          ...readyRoadmapSlice,
          gate: "Correlation contract test",
          gatedOn: null,
        };
      },
    });

    const intent = await new RoadmapReadAdapter(transport).resolveWorktreeIntent(roadmapRequest);
    assert.equal(intent.worktree.preparation, "not-started");
    assert.deepEqual(calls, [
      { name: "plan", input: {} },
      { name: "show", input: { invoke: "roadmap-adapter" } },
    ]);

    const controller = new AbortController();
    controller.abort(new Error("operator cancelled"));
    await assert.rejects(
      () => new RoadmapReadAdapter(transport).resolveWorktreeIntent(roadmapRequest, { signal: controller.signal }),
      /operator cancelled/,
    );
  });

  it("redacts malformed Roadmap responses behind a stable adapter error", async () => {
    const malformed = new StaticRoadmapReadTransport(
      { waves: [[{ invoke: "roadmap-adapter" }]] },
      {},
    );
    await assert.rejects(
      () => new RoadmapReadAdapter(malformed).resolveWorktreeIntent(roadmapRequest),
      (error: unknown) => error instanceof RoadmapAdapterError && error.code === "INVALID_ROADMAP_RESPONSE",
    );
  });
});
