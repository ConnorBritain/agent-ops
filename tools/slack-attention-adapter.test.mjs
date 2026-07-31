import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(
  new URL("../packages/adapters/src/slack-attention.ts", import.meta.url),
  "utf8",
);
const adapterTests = await readFile(
  new URL("../packages/adapters/test/slack-attention.test.ts", import.meta.url),
  "utf8",
);

test("Slack attention remains a secret-safe, non-authoritative Socket Mode boundary", () => {
  assert.match(source, /assertSlackSocketModeConfiguration/);
  assert.match(source, /sanitizeSlackSocketEnvelope/);
  assert.match(source, /ingressStore\.reserve/);
  assert.match(source, /coordinator\.handle/);
  assert.match(source, /ingressStore\.complete/);
  assert.match(source, /acknowledger\.acknowledge/);
  assert.match(source, /exact-worker-question/);
  assert.match(source, /out-of-band-authorized-provider-flow/);
  assert.doesNotMatch(source, /node:net|node:http|@slack\/bolt|@slack\/web-api/);
  assert.doesNotMatch(source, /new\s+WebSocket|fetch\s*\(|process\.env|setInterval|setTimeout/);
  assert.doesNotMatch(source, /createJob|workerDispatch|provider\.start|provider\.resume/);
  assert.match(adapterTests, /persists durable acceptance before its acknowledgement/);
  assert.match(adapterTests, /acknowledges a duplicate envelope/);
  assert.match(adapterTests, /separates a concise summary from an exact worker question/);
});
