import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(
  new URL("../packages/providers/codex-app-server/src/index.ts", import.meta.url),
  "utf8",
);

test("Codex App Server provider remains an injected local-stdio adapter", () => {
  assert.match(source, /arguments: \["app-server", "--listen", "stdio:\/\/"\]/);
  assert.match(source, /notify\("initialized", \{\}\)/);
  assert.match(source, /turn\/steer/);
  assert.match(source, /turn\/interrupt/);
  assert.match(source, /automaticRestart: "disabled"/);
  assert.doesNotMatch(source, /node:child_process|\b(?:spawn|exec|fork|shell)\s*\(/);
  assert.doesNotMatch(source, /--listen ws:\/\/|--listen wss:\/\/|--yolo|bypass-approval|WebSocket/);
  assert.doesNotMatch(source, /recordEvent|updateRun|updateTask|Coordinator/);
});
