import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NormalizedEvent, SignedJobEnvelope } from "@agent-ops/contracts";
import {
  DeterministicClock,
  InMemoryWorkerControlPlane,
  StaticResourceInspector,
  buildJobEnvelope,
  buildWorkerManifest,
  testIds,
} from "@agent-ops/test-kit";
import {
  WorkerSupervisor,
  type WorkerRuntimeConfiguration,
  type WorkerRuntimePorts,
} from "../src/index.ts";

const createFixture = (input: {
  readonly signatureVerified?: boolean;
  readonly policyVerified?: boolean;
  readonly leaseAuthorityVerified?: boolean;
  readonly pathAllowed?: boolean;
  readonly resources?: StaticResourceInspector;
  readonly controlPlane?: InMemoryWorkerControlPlane;
  readonly configuration?: Partial<WorkerRuntimeConfiguration>;
} = {}) => {
  const clock = new DeterministicClock();
  const controlPlane = input.controlPlane ?? new InMemoryWorkerControlPlane();
  const resources = input.resources ?? new StaticResourceInspector();
  const configuration: WorkerRuntimeConfiguration = {
    registrationId: testIds.registration,
    bootId: testIds.boot,
    manifest: buildWorkerManifest(),
    limits: {
      minimumFreeDiskBytes: 20_000,
      maximumActiveWorktrees: 2,
      maximumRunningJobs: 1,
      maximumRuntimeSeconds: 1_800,
    },
    ...input.configuration,
  };
  const ports: WorkerRuntimePorts = {
    clock,
    controlPlane,
    resources,
    verifier: {
      async verifySignature() {
        return input.signatureVerified ?? true;
      },
      async verifyPolicy() {
        return input.policyVerified ?? true;
      },
      async verifyCoordinatorLease() {
        return input.leaseAuthorityVerified ?? true;
      },
    },
    pathScope: {
      async isAllowed() {
        return input.pathAllowed ?? true;
      },
    },
    skills: {
      satisfies(installedVersion, requiredRange) {
        if (requiredRange === "*") return true;
        if (requiredRange.startsWith("^")) {
          return installedVersion.split(".")[0] === requiredRange.slice(1).split(".")[0];
        }
        return installedVersion === requiredRange;
      },
    },
  };
  return {
    clock,
    configuration,
    controlPlane,
    resources,
    supervisor: new WorkerSupervisor(configuration, ports),
  };
};

describe("worker supervisor boot and health", () => {
  it("registers and heartbeats idle without restoring a workload", async () => {
    const fixture = createFixture();
    const inspection = await fixture.supervisor.start();

    assert.deepEqual(inspection, {
      started: true,
      mode: "idle",
      activeJobIds: [],
    });
    assert.equal(fixture.controlPlane.registrations.length, 1);
    assert.equal(fixture.controlPlane.registrations[0]?.automaticResume, false);
    assert.equal(fixture.controlPlane.registrations[0]?.mode, "idle");
    assert.equal(fixture.controlPlane.heartbeats.length, 1);
    assert.deepEqual(fixture.controlPlane.heartbeats[0]?.activeJobIds, []);
    assert.equal(fixture.controlPlane.events[0]?.type, "worker.booted");
    assert.deepEqual(fixture.controlPlane.events[0]?.payload, {
      bootId: testIds.boot,
      automaticResume: false,
      recoveredJobCount: 0,
    });
  });

  it("uses monotonic per-boot heartbeat and event identifiers", async () => {
    const fixture = createFixture();
    await fixture.supervisor.start();
    fixture.clock.advance(1_000);
    await fixture.supervisor.heartbeat();

    assert.deepEqual(
      fixture.controlPlane.heartbeats.map((heartbeat) => heartbeat.sequence),
      [0, 1],
    );
    assert.equal(new Set(
      fixture.controlPlane.events.map((event) => event.sourceEventId),
    ).size, fixture.controlPlane.events.length);
  });

  it("retries an interrupted boot with the same idempotency identifiers", async () => {
    class InterruptedControlPlane extends InMemoryWorkerControlPlane {
      failHealthOnce = true;

      override async recordEvent(event: NormalizedEvent): Promise<void> {
        if (event.type === "worker.health" && this.failHealthOnce) {
          this.failHealthOnce = false;
          throw new Error("simulated durable write interruption");
        }
        await super.recordEvent(event);
      }
    }
    const controlPlane = new InterruptedControlPlane();
    const fixture = createFixture({ controlPlane });

    await assert.rejects(
      fixture.supervisor.start(),
      /simulated durable write interruption/,
    );
    assert.equal(fixture.supervisor.inspect().started, false);
    await fixture.supervisor.start();

    assert.equal(fixture.supervisor.inspect().started, true);
    assert.deepEqual(
      controlPlane.heartbeats.map((heartbeat) => heartbeat.sequence),
      [0, 0],
    );
    assert.deepEqual(
      controlPlane.events
        .filter((event) => event.type === "worker.booted")
        .map((event) => event.sourceEventId),
      [
        `${testIds.boot}:worker.booted`,
        `${testIds.boot}:worker.booted`,
      ],
    );
  });
});

describe("worker job admission", () => {
  it("admits a valid bounded envelope once without starting a provider", async () => {
    const fixture = createFixture();
    await fixture.supervisor.start();

    assert.deepEqual(await fixture.supervisor.admit(buildJobEnvelope()), {
      accepted: true,
      jobId: testIds.job,
      duplicate: false,
    });
    assert.deepEqual(fixture.supervisor.inspect(), {
      started: true,
      mode: "busy",
      activeJobIds: [testIds.job],
    });
    assert.equal(fixture.controlPlane.events.at(-1)?.type, "worker.job-admitted");
    assert.deepEqual(fixture.controlPlane.events.at(-1)?.payload, {
      leaseFence: 1,
      automaticStart: false,
    });

    const eventCount = fixture.controlPlane.events.length;
    assert.deepEqual(await fixture.supervisor.admit(buildJobEnvelope()), {
      accepted: true,
      jobId: testIds.job,
      duplicate: true,
    });
    assert.equal(fixture.controlPlane.events.length, eventCount);

    assert.deepEqual(await fixture.supervisor.admit(buildJobEnvelope({
      jobId: "00000000-0000-4000-8000-000000000109",
    })), {
      accepted: false,
      reasons: ["job-capacity"],
    });
  });

  it("uses trusted coordinator-lease evidence instead of the worker principal", async () => {
    const fixture = createFixture();
    await fixture.supervisor.start();
    const coordinatorPrincipal = "00000000-0000-4000-8000-000000000999";

    assert.deepEqual(await fixture.supervisor.admit(buildJobEnvelope({
      lease: {
        ...buildJobEnvelope().lease,
        holderId: coordinatorPrincipal,
      },
    })), {
      accepted: true,
      jobId: testIds.job,
      duplicate: false,
    });

    const rejected = createFixture({ leaseAuthorityVerified: false });
    await rejected.supervisor.start();
    assert.deepEqual(await rejected.supervisor.admit(buildJobEnvelope({
      lease: {
        ...buildJobEnvelope().lease,
        holderId: coordinatorPrincipal,
      },
    })), {
      accepted: false,
      reasons: ["lease-authority-not-verified"],
    });
  });

  it("serializes concurrent duplicate admission without duplicate events", async () => {
    const fixture = createFixture();
    await fixture.supervisor.start();
    const before = fixture.controlPlane.events.length;
    const [first, second] = await Promise.all([
      fixture.supervisor.admit(buildJobEnvelope()),
      fixture.supervisor.admit(buildJobEnvelope()),
    ]);

    assert.deepEqual(first, {
      accepted: true,
      jobId: testIds.job,
      duplicate: false,
    });
    assert.deepEqual(second, {
      accepted: true,
      jobId: testIds.job,
      duplicate: true,
    });
    assert.equal(fixture.controlPlane.events.length, before + 1);
  });

  it("treats semantically identical object key order as the same admission", async () => {
    const fixture = createFixture();
    await fixture.supervisor.start();
    await fixture.supervisor.admit(buildJobEnvelope({
      body: { alpha: 1, beta: 2 },
    }));

    assert.deepEqual(await fixture.supervisor.admit(buildJobEnvelope({
      body: { beta: 2, alpha: 1 },
    })), {
      accepted: true,
      jobId: testIds.job,
      duplicate: true,
    });
  });

  it("fails closed when a later resource inspection violates the snapshot contract", async () => {
    const resources = new StaticResourceInspector();
    const fixture = createFixture({ resources });
    await fixture.supervisor.start();
    resources.snapshot = {
      ...resources.snapshot,
      availableMemoryBytes: -1,
    } as unknown as typeof resources.snapshot;

    await assert.rejects(fixture.supervisor.admit(buildJobEnvelope()));
    assert.deepEqual(fixture.supervisor.inspect().activeJobIds, []);
  });

  it("does not reserve a job until its durable admission event succeeds", async () => {
    class InterruptedControlPlane extends InMemoryWorkerControlPlane {
      admissionAttempts: NormalizedEvent[] = [];
      failAdmissionOnce = true;

      override async recordEvent(event: NormalizedEvent): Promise<void> {
        if (event.type === "worker.job-admitted") {
          this.admissionAttempts.push(event);
          await super.recordEvent(event);
          if (this.failAdmissionOnce) {
            this.failAdmissionOnce = false;
            throw new Error("simulated uncertain admission write");
          }
          return;
        }
        await super.recordEvent(event);
      }
    }
    const controlPlane = new InterruptedControlPlane();
    const fixture = createFixture({ controlPlane });
    await fixture.supervisor.start();

    await assert.rejects(
      fixture.supervisor.admit(buildJobEnvelope()),
      /simulated uncertain admission write/,
    );
    assert.deepEqual(fixture.supervisor.inspect().activeJobIds, []);
    assert.deepEqual(await fixture.supervisor.admit(buildJobEnvelope()), {
      accepted: true,
      jobId: testIds.job,
      duplicate: false,
    });
    assert.equal(controlPlane.admissionAttempts.length, 2);
    assert.equal(
      controlPlane.admissionAttempts[0]?.sourceEventId,
      controlPlane.admissionAttempts[1]?.sourceEventId,
    );
  });

  it("rejects an expired, untrusted, out-of-domain, out-of-scope job before launch", async () => {
    const resources = new StaticResourceInspector({
      freeDiskBytes: 1,
      availableMemoryBytes: 1,
      activeWorktreeCount: 2,
      runningJobCount: 1,
    });
    const fixture = createFixture({
      signatureVerified: false,
      policyVerified: false,
      leaseAuthorityVerified: false,
      pathAllowed: false,
      resources,
    });
    await fixture.supervisor.start();
    const envelope = buildJobEnvelope({
      securityDomain: "another-domain",
      requiredCapabilities: ["browser"],
      requiredSkills: [{ key: "missing-skill", versionRange: "^1" }],
      resourceBudget: {
        minimumFreeDiskBytes: 10_000,
        memoryReservationBytes: 5_000,
        worktreeSlots: 1,
        maximumRuntimeSeconds: 3_600,
      },
      lease: {
        leaseName: "worker-job",
        holderId: "00000000-0000-4000-8000-000000000999",
        fencingToken: 1,
        expiresAt: "2026-07-30T03:59:59Z",
      },
    });

    assert.deepEqual(await fixture.supervisor.admit(envelope), {
      accepted: false,
      reasons: [
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
    assert.deepEqual(fixture.supervisor.inspect().activeJobIds, []);
    assert.equal(fixture.controlPlane.events.at(-1)?.type, "worker.job-rejected");
  });

  it("rejects missing budgets, malformed envelopes, and inline secrets", async () => {
    const fixture = createFixture();
    await fixture.supervisor.start();
    const withoutBudget = buildJobEnvelope();
    delete (withoutBudget as Partial<SignedJobEnvelope>).resourceBudget;
    assert.deepEqual(await fixture.supervisor.admit(withoutBudget), {
      accepted: false,
      reasons: ["missing-resource-budget"],
    });
    assert.deepEqual(await fixture.supervisor.admit({
      ...buildJobEnvelope(),
      body: { token: "inline-value" },
    }), {
      accepted: false,
      reasons: ["invalid-envelope"],
    });
    assert.deepEqual(fixture.controlPlane.events.at(-1)?.payload, {
      reasons: ["invalid-envelope"],
    });
  });

  it("rejects calls before startup", async () => {
    const fixture = createFixture();
    assert.deepEqual(await fixture.supervisor.admit(buildJobEnvelope()), {
      accepted: false,
      reasons: ["supervisor-not-started"],
    });
  });
});

describe("worker cancellation and inspection", () => {
  it("cancels an admitted job safely and remains idle", async () => {
    const fixture = createFixture();
    await fixture.supervisor.start();
    await fixture.supervisor.admit(buildJobEnvelope());

    assert.deepEqual(await fixture.supervisor.cancel(testIds.job), {
      cancelled: true,
      jobId: testIds.job,
    });
    assert.deepEqual(fixture.supervisor.inspect(), {
      started: true,
      mode: "idle",
      activeJobIds: [],
    });
    assert.deepEqual(await fixture.supervisor.cancel(testIds.job), {
      cancelled: false,
      jobId: testIds.job,
      reason: "already-terminal",
    });
    assert.equal(fixture.controlPlane.events.at(-1)?.type, "worker.job-cancelled");
  });

  it("does not invent state for an unknown job", async () => {
    const fixture = createFixture();
    await fixture.supervisor.start();
    const unknown = "00000000-0000-4000-8000-000000000998";
    assert.deepEqual(await fixture.supervisor.cancel(unknown), {
      cancelled: false,
      jobId: unknown,
      reason: "not-found",
    });
  });

  it("keeps an admitted job active until its durable cancellation event succeeds", async () => {
    class InterruptedControlPlane extends InMemoryWorkerControlPlane {
      cancellationAttempts: NormalizedEvent[] = [];
      failCancellationOnce = true;

      override async recordEvent(event: NormalizedEvent): Promise<void> {
        if (event.type === "worker.job-cancelled") {
          this.cancellationAttempts.push(event);
          await super.recordEvent(event);
          if (this.failCancellationOnce) {
            this.failCancellationOnce = false;
            throw new Error("simulated uncertain cancellation write");
          }
          return;
        }
        await super.recordEvent(event);
      }
    }
    const controlPlane = new InterruptedControlPlane();
    const fixture = createFixture({ controlPlane });
    await fixture.supervisor.start();
    await fixture.supervisor.admit(buildJobEnvelope());

    await assert.rejects(
      fixture.supervisor.cancel(testIds.job),
      /simulated uncertain cancellation write/,
    );
    assert.deepEqual(fixture.supervisor.inspect().activeJobIds, [testIds.job]);
    assert.deepEqual(await fixture.supervisor.cancel(testIds.job), {
      cancelled: true,
      jobId: testIds.job,
    });
    assert.equal(controlPlane.cancellationAttempts.length, 2);
    assert.equal(
      controlPlane.cancellationAttempts[0]?.sourceEventId,
      controlPlane.cancellationAttempts[1]?.sourceEventId,
    );
  });

  it("does not reactivate a cancelled job through duplicate delivery", async () => {
    const fixture = createFixture();
    await fixture.supervisor.start();
    await fixture.supervisor.admit(buildJobEnvelope());
    await fixture.supervisor.cancel(testIds.job);

    assert.deepEqual(await fixture.supervisor.admit(buildJobEnvelope()), {
      accepted: false,
      reasons: ["duplicate-job"],
    });
    assert.deepEqual(fixture.supervisor.inspect().activeJobIds, []);
  });
});
