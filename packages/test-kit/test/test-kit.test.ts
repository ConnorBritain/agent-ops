import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DeterministicClock,
  InMemoryWorkerControlPlane,
  StaticRoadmapReadTransport,
  StaticResourceInspector,
  assertRebootIdleServiceFixture,
  buildJobEnvelope,
  buildWorkerManifest,
} from "../src/index.ts";

describe("deterministic worker test kit", () => {
  it("provides stable time, resources, contracts, and recordings", async () => {
    const clock = new DeterministicClock();
    const resources = new StaticResourceInspector();
    const controlPlane = new InMemoryWorkerControlPlane();
    const first = clock.now();
    clock.advance(1_000);

    assert.equal(first, "2026-07-30T04:00:00.000Z");
    assert.equal(clock.now(), "2026-07-30T04:00:01.000Z");
    assert.equal((await resources.inspect()).runningJobCount, 0);
    assert.equal(buildWorkerManifest().securityDomain, "example-domain");
    assert.equal(buildJobEnvelope().resourceBudget?.worktreeSlots, 1);
    assert.deepEqual(controlPlane.events, []);
  });

  it("models a reboot that restores only the supervisor", () => {
    assert.deepEqual(assertRebootIdleServiceFixture({
      platform: "systemd",
      startsWithoutInteractiveLogin: true,
      startsSupervisorOnly: true,
      automaticWorkloadResume: false,
      restartsSupervisorOnFailure: true,
    }), {
      platform: "systemd",
      startsWithoutInteractiveLogin: true,
      startsSupervisorOnly: true,
      automaticWorkloadResume: false,
      restartsSupervisorOnFailure: true,
    });
    assert.throws(() => assertRebootIdleServiceFixture({
      platform: "launchd",
      startsWithoutInteractiveLogin: true,
      startsSupervisorOnly: true,
      automaticWorkloadResume: true,
      restartsSupervisorOnFailure: true,
    }), /never automatically resume/);
  });

  it("records deterministic Roadmap reads without creating a worktree", async () => {
    const transport = new StaticRoadmapReadTransport(
      { waves: [[]] },
      { "roadmap-adapter": { invoke: "roadmap-adapter" } },
    );
    await transport.plan();
    await transport.showSlice({ invoke: "roadmap-adapter" });
    assert.deepEqual(transport.calls, [
      { method: "plan" },
      { method: "show", invoke: "roadmap-adapter" },
    ]);
  });
});
