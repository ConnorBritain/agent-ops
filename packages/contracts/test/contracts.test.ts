import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONTRACT_VERSION,
  assertNoInlineSecrets,
  commandSchema,
  coordinatorProjectionCommandSchema,
  draftPullRequestIntentSchema,
  externalProjectionFactSchema,
  normalizedEventSchema,
  providerCapabilityManifestSchema,
  providerInvocationSchema,
  roadmapWorktreeIntentRequestSchema,
  roadmapWorktreeIntentSchema,
  safetyAuditRecordSchema,
  signedJobEnvelopeSchema,
  verificationRecordSchema,
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

  it("requires secret-safe audit evidence and dry-run-only cleanup proposals", () => {
    const audit = {
      version: CONTRACT_VERSION,
      policyVersion: "0.1.0",
      decision: "remediate",
      workerTransition: "none",
      findings: [{
        code: "stale-session",
        severity: "warning",
        evidence: { sessionId: "session-001" },
      }],
      remediation: {
        kind: "cleanup-proposal",
        mode: "dry-run",
        targets: ["/workspace/retired-worktree"],
        evidencePreserved: true,
        outcome: "proposed",
      },
    };
    assert.equal(safetyAuditRecordSchema.parse(audit).decision, "remediate");
    assert.equal(safetyAuditRecordSchema.safeParse({
      ...audit,
      findings: [{
        ...audit.findings[0],
        evidence: { token: "inline-value" },
      }],
    }).success, false);
    assert.equal(safetyAuditRecordSchema.safeParse({
      ...audit,
      remediation: { ...audit.remediation, mode: "none" },
    }).success, false);
  });

  it("validates a correlated Roadmap worktree intent without treating it as a launch", () => {
    const request = {
      version: CONTRACT_VERSION,
      correlationId: "00000000-0000-4000-8000-000000000011",
      taskId: ids.task,
      runId: ids.run,
      securityDomain: "example-domain",
      sliceKey: "roadmap-adapter",
      requestedAt: "2026-07-30T04:00:00Z",
    };
    assert.equal(roadmapWorktreeIntentRequestSchema.parse(request).sliceKey, "roadmap-adapter");
    assert.equal(roadmapWorktreeIntentSchema.parse({
      version: request.version,
      correlationId: request.correlationId,
      taskId: request.taskId,
      runId: request.runId,
      securityDomain: request.securityDomain,
      slice: { key: "roadmap-adapter", pi: "phase-4-roadmap", sprint: "roadmap-adapter", wave: 0 },
      gate: { source: "roadmap", expression: "Correlation contract test" },
      worktree: {
        authority: "roadmap",
        branch: "phase-4-roadmap/roadmap-adapter",
        reference: "/workspace/agent-ops/worktrees/roadmap-adapter",
        preparation: "not-started",
      },
    }).worktree.preparation, "not-started");
  });

  it("accepts only Coordinator-issued, provenance-bearing external projections", () => {
    const projection = {
      version: CONTRACT_VERSION,
      commandId: ids.actor,
      actor: { id: ids.actor, kind: "coordinator", securityDomain: "example-domain" },
      taskId: ids.task,
      runId: ids.run,
      securityDomain: "example-domain",
      projection: {
        version: CONTRACT_VERSION,
        projectionId: ids.registration,
        idempotencyKey: "projection-contract-001",
        taskId: ids.task,
        runId: ids.run,
        securityDomain: "example-domain",
        kind: "portfolio-transition",
        links: [
          { kind: "issue", system: "github", externalRef: "github://fixture/issues/1" },
          { kind: "slice", system: "roadmap", externalRef: "roadmap://fixture/slices/1" },
          { kind: "pull-request", system: "github", externalRef: "github://fixture/pulls/1" },
          { kind: "external-session", system: "external", externalRef: "external://fixture/sessions/1" },
        ],
        transition: "ready-for-review",
        summary: "The bounded fixture is ready for review.",
        requestedAt: "2026-07-30T04:00:00Z",
      },
      issuedAt: "2026-07-30T04:00:00Z",
    };
    assert.equal(coordinatorProjectionCommandSchema.parse(projection).actor.kind, "coordinator");
    assert.equal(
      coordinatorProjectionCommandSchema.safeParse({
        ...projection,
        actor: { ...projection.actor, kind: "integration" },
      }).success,
      false,
    );
    assert.equal(externalProjectionFactSchema.safeParse({
      version: CONTRACT_VERSION,
      projectionId: projection.projection.projectionId,
      taskId: ids.task,
      runId: ids.run,
      securityDomain: "example-domain",
      system: "github",
      externalRef: "github://fixture/projections/1",
      source: { kind: "integration", id: "github-projection" },
      sourceEventId: "github-projection-event-001",
      occurredAt: "2026-07-30T04:00:00Z",
      ingestedAt: "2026-07-30T04:00:01Z",
      metadata: { token: "inline-value" },
    }).success, false);
  });

  it("requires a complete provider lifecycle and secret-safe invocation", () => {
    const lifecycle = [
      "validate-environment", "start", "send-input", "inspect",
      "pause", "resume", "cancel", "collect-artifacts",
    ].map((operation) => ({ operation, support: "supported" }));
    assert.equal(providerCapabilityManifestSchema.parse({
      version: CONTRACT_VERSION,
      providerId: "print-provider",
      providerVersion: "0.1.0",
      executionMode: "no-execution",
      capabilities: ["terminal"],
      lifecycle,
    }).lifecycle.length, 8);
    assert.equal(providerCapabilityManifestSchema.safeParse({
      version: CONTRACT_VERSION,
      providerId: "print-provider",
      providerVersion: "0.1.0",
      executionMode: "no-execution",
      capabilities: ["terminal"],
      lifecycle: lifecycle.slice(0, 7),
    }).success, false);

    const envelope = {
      version: CONTRACT_VERSION,
      jobId: ids.job,
      taskId: ids.task,
      runId: ids.run,
      securityDomain: "example-domain",
      requiredCapabilities: ["terminal"],
      requiredSkills: [],
      policyDecisionId: ids.policy,
      lease: { leaseName: "provider-job", holderId: ids.holder, fencingToken: 1, expiresAt: "2026-07-30T05:00:00Z" },
      safeWorkingDirectory: "/workspace/example",
      redactionPolicyRef: "policy://redaction/default",
      callbackIdentityRef: "secret://agentops/callback/provider",
      body: { objective: "fixture" },
      signature: { algorithm: "ed25519", keyRef: "secret://agentops/signing/provider", value: "a".repeat(64) },
    };
    assert.equal(providerInvocationSchema.safeParse({
      version: CONTRACT_VERSION,
      invocationId: ids.registration,
      operation: "start",
      envelope,
      input: { accessToken: "inline-value" },
      requestedAt: "2026-07-30T04:00:00Z",
    }).success, false);
  });

  it("keeps independent verification and draft delivery secret-safe and draft-only", () => {
    const verification = verificationRecordSchema.parse({
      version: CONTRACT_VERSION,
      id: "00000000-0000-4000-8000-000000000021",
      taskId: "00000000-0000-4000-8000-000000000022",
      runId: "00000000-0000-4000-8000-000000000023",
      securityDomain: "example-domain",
      verifierId: "independent-fixture",
      verdict: "pass",
      summary: "The bounded fixture is independently verified.",
      implementationEvidenceRefs: ["evidence://fixture/reversible-change"],
      verifiedAt: "2026-07-30T04:00:00Z",
    });
    assert.equal(verification.verdict, "pass");
    const draft = {
      version: CONTRACT_VERSION,
      deliveryId: "00000000-0000-4000-8000-000000000024",
      idempotencyKey: "draft-delivery-fixture-001",
      taskId: verification.taskId,
      runId: verification.runId,
      securityDomain: verification.securityDomain,
      repositoryRef: "repo://fixture/reversible-change",
      headRef: "refs/heads/agentops/fixture-change",
      baseRef: "refs/heads/main",
      title: "Fixture reversible change",
      verificationId: verification.id,
      policyDecisionId: "00000000-0000-4000-8000-000000000025",
      draft: true,
      requestedAt: "2026-07-30T04:00:00Z",
    };
    assert.equal(draftPullRequestIntentSchema.parse(draft).draft, true);
    assert.equal(draftPullRequestIntentSchema.safeParse({ ...draft, draft: false }).success, false);
  });
});
