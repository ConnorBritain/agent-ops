import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONTRACT_VERSION,
  assertNoInlineSecrets,
  commandSchema,
  normalizedEventSchema,
  signedJobEnvelopeSchema,
  workerHeartbeatSchema,
  workerManifestSchema,
  workerRegistrationSchema,
} from "../src/index.ts";

const ids = {
  actor: "00000000-0000-4000-8000-000000000001",
  target: "00000000-0000-4000-8000-000000000002",
  job: "00000000-0000-4000-8000-000000000003",
  task: "00000000-0000-4000-8000-000000000004",
  run: "00000000-0000-4000-8000-000000000005",
  policy: "00000000-0000-4000-8000-000000000006",
  holder: "00000000-0000-4000-8000-000000000007",
  worker: "00000000-0000-4000-8000-000000000008",
  boot: "00000000-0000-4000-8000-000000000009",
  registration: "00000000-0000-4000-8000-000000000010",
};

describe("versioned contracts", () => {
  it("accepts a bounded command and rejects an unknown field", () => {
    const command = {
      version: CONTRACT_VERSION,
      idempotencyKey: "intent-0001",
      actor: { id: ids.actor, kind: "human", securityDomain: "example-domain" },
      source: { kind: "cli", sourceId: "local-cli" },
      kind: "DispatchTask",
      target: { kind: "task", id: ids.target },
      requiredCapabilities: ["terminal"],
    };
    assert.equal(commandSchema.parse(command).kind, "DispatchTask");
    assert.equal(commandSchema.safeParse({ ...command, rawShell: "rm -rf" }).success, false);
  });

  it("accepts secret references and rejects inline secret fields recursively", () => {
    assert.doesNotThrow(() => assertNoInlineSecrets({
      callbackIdentity: "secret://agentops/callback/worker",
    }));
    assert.throws(
      () => assertNoInlineSecrets({ nested: { password: "inline-value" } }),
      /Inline secret rejected/,
    );
    assert.throws(
      () => assertNoInlineSecrets({ nested: { accessToken: "inline-value" } }),
      /Inline secret rejected/,
    );
  });

  it("validates a signed, fenced job envelope", () => {
    const envelope = {
      version: CONTRACT_VERSION,
      jobId: ids.job,
      taskId: ids.task,
      runId: ids.run,
      securityDomain: "example-domain",
      requiredCapabilities: ["terminal"],
      requiredSkills: [{ key: "repository-inspection", versionRange: "^1" }],
      policyDecisionId: ids.policy,
      lease: {
        leaseName: "primary-coordinator",
        holderId: ids.holder,
        fencingToken: 4,
        expiresAt: "2026-07-30T05:00:00Z",
      },
      safeWorkingDirectory: "/workspace/example",
      resourceBudget: {
        minimumFreeDiskBytes: 10_000,
        memoryReservationBytes: 1_000,
        worktreeSlots: 1,
        maximumRuntimeSeconds: 900,
      },
      redactionPolicyRef: "policy://redaction/default",
      callbackIdentityRef: "secret://agentops/callback/worker",
      body: { objective: "Run the bounded validation gate." },
      signature: {
        algorithm: "ed25519",
        keyRef: "secret://agentops/signing/coordinator",
        value: "a".repeat(64),
      },
    };
    assert.equal(signedJobEnvelopeSchema.parse(envelope).lease.fencingToken, 4);
    assert.equal(
      signedJobEnvelopeSchema.safeParse({
        ...envelope,
        body: { apiKey: "inline-value" },
      }).success,
      false,
    );
  });

  it("validates unique worker manifests, registrations, and heartbeats", () => {
    const manifest = {
      version: CONTRACT_VERSION,
      workerId: ids.worker,
      principalId: ids.holder,
      securityDomain: "example-domain",
      runtimeVersion: "0.1.0",
      capabilities: ["terminal", "git"],
      skills: [{ key: "repository-inspection", version: "1.0.0" }],
      providers: [{
        providerId: "print-provider",
        version: "0.1.0",
        capabilities: ["terminal"],
      }],
      generatedAt: "2026-07-30T04:00:00Z",
    };
    assert.equal(workerManifestSchema.parse(manifest).capabilities.length, 2);
    assert.equal(
      workerManifestSchema.safeParse({
        ...manifest,
        capabilities: ["terminal", "terminal"],
      }).success,
      false,
    );

    const resources = {
      freeDiskBytes: 100_000,
      availableMemoryBytes: 50_000,
      activeWorktreeCount: 0,
      runningJobCount: 0,
    };
    assert.equal(workerRegistrationSchema.parse({
      version: CONTRACT_VERSION,
      registrationId: ids.registration,
      bootId: ids.boot,
      manifest,
      resources,
      mode: "idle",
      automaticResume: false,
      occurredAt: "2026-07-30T04:00:00Z",
    }).automaticResume, false);
    assert.equal(workerHeartbeatSchema.parse({
      version: CONTRACT_VERSION,
      workerId: ids.worker,
      bootId: ids.boot,
      sequence: 1,
      mode: "idle",
      activeJobIds: [],
      resources,
      occurredAt: "2026-07-30T04:00:01Z",
    }).sequence, 1);
  });

  it("rejects secret-like normalized event payloads", () => {
    const event = {
      version: CONTRACT_VERSION,
      type: "worker.health",
      entity: { type: "worker", id: ids.actor },
      source: { kind: "worker", id: ids.actor },
      sourceEventId: "health-0001",
      securityDomain: "example-domain",
      occurredAt: "2026-07-30T04:00:00Z",
      ingestedAt: "2026-07-30T04:00:01Z",
      payload: { state: "ready" },
    };
    assert.equal(normalizedEventSchema.parse(event).type, "worker.health");
    assert.equal(
      normalizedEventSchema.safeParse({
        ...event,
        payload: { token: "inline-value" },
      }).success,
      false,
    );
  });
});
