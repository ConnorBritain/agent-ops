import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DeterministicClock,
  InMemoryWorkerControlPlane,
  StaticRoadmapReadTransport,
  ScriptedJsonRpcTransport,
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

  it("models a bounded Codex App Server lifecycle without a binary or credentials", async () => {
    const transport = new ScriptedJsonRpcTransport([
      { method: "initialize", params: { clientInfo: { name: "agent-ops" } }, result: { platformFamily: "unix" } },
      { type: "notification", method: "initialized", params: {} },
      { method: "thread/start", params: { model: "selected-by-provider" }, result: { thread: { id: "thread-1" } } },
      { method: "turn/start", params: { threadId: "thread-1", input: [{ type: "text", text: "bounded task" }] }, result: { turn: { id: "turn-1" } } },
      { method: "turn/steer", params: { threadId: "thread-1", input: [{ type: "text", text: "bounded follow-up" }] }, result: { turnId: "turn-1" } },
      { method: "thread/read", params: { threadId: "thread-1" }, result: { thread: { status: { type: "active", activeFlags: [] } } } },
      { method: "turn/interrupt", params: { threadId: "thread-1", turnId: "turn-1" }, result: {} },
    ]);
    await transport.request("initialize", { clientInfo: { name: "agent-ops" } });
    await transport.notify("initialized", {});
    await transport.request("thread/start", { model: "selected-by-provider" });
    await transport.request("turn/start", { threadId: "thread-1", input: [{ type: "text", text: "bounded task" }] });
    await transport.request("turn/steer", { threadId: "thread-1", input: [{ type: "text", text: "bounded follow-up" }] });
    await transport.request("thread/read", { threadId: "thread-1" });
    await transport.request("turn/interrupt", { threadId: "thread-1", turnId: "turn-1" });
    transport.assertComplete();
    assert.deepEqual(transport.requests.map((request) => request.method), [
      "initialize", "thread/start", "turn/start", "turn/steer", "thread/read", "turn/interrupt",
    ]);
    assert.deepEqual(transport.notifications, [{ method: "initialized", params: {} }]);
  });
});
