import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(
  new URL("../apps/coordinator/src/index.ts", import.meta.url),
  "utf8",
);
const domainSource = await readFile(
  new URL("../packages/domain/src/index.ts", import.meta.url),
  "utf8",
);

test("Coordinator runtime remains a durable-port application service", () => {
  assert.match(source, /recordIntent/);
  assert.match(source, /recordSchedulingDecision/);
  assert.match(source, /createAttention/);
  assert.match(source, /recordAttentionResponse/);
  assert.match(source, /recordProviderAcknowledgement/);
  assert.match(source, /reconcileObservedState/);
  assert.match(domainSource, /automaticallyRestart: false/);
  assert.doesNotMatch(source, /node:child_process|node:http|node:net|createServer|WebSocket/);
  assert.doesNotMatch(source, /setInterval|setTimeout|WorkerSupervisor|spawn\s*\(|exec\s*\(/);
  assert.doesNotMatch(source, /updateTask|updateRun|provider\.start|provider\.resume/);
});
