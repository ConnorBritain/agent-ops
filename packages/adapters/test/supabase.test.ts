import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONTRACT_VERSION } from "@agent-ops/contracts";
import {
  DurableStoreError,
  SupabaseDurableOperationalStore,
  type RpcOptions,
  type RpcTransport,
} from "../src/index.ts";

const coordinatorId = "00000000-0000-4000-8000-000000000001";

describe("Supabase durable-store adapter", () => {
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
});
