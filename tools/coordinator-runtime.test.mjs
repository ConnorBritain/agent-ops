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
  assert.match(source, /answerAndResume/);
  assert.match(source, /reconcileObservedState/);
  assert.match(domainSource, /automaticallyRestart: false/);
  assert.doesNotMatch(source, /node:child_process|node:http|node:net|createServer|WebSocket/);
  assert.doesNotMatch(source, /setInterval|setTimeout|WorkerSupervisor|spawn\s*\(|exec\s*\(/);
  assert.doesNotMatch(source, /updateTask|updateRun|provider\.start|provider\.resume/);
});

test("Coordinator response-resume ordering remains explicit and run-bound", () => {
  const answerAndResume = source.indexOf("async answerAndResume");
  const durableAnswer = source.indexOf("await this.answerAttention(rawInput.answer)", answerAndResume);
  const resumedDispatch = source.indexOf("dispatch: await this.dispatch(rawInput.dispatch)", answerAndResume);
  assert.ok(answerAndResume >= 0);
  assert.ok(durableAnswer > answerAndResume);
  assert.ok(resumedDispatch > durableAnswer);
  assert.match(source, /answer\.attention\.runId !== envelope\.runId/);
  assert.match(source, /may resume only its retained task and run/);
});
