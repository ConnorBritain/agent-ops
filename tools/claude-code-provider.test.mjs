import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(
  new URL("../packages/providers/claude-code/src/index.ts", import.meta.url),
  "utf8",
);

test("Claude Code provider remains an injected bounded local-stdio adapter", () => {
  assert.match(source, /"--bare",\n\s+"--print",\n\s+"--output-format", "stream-json"/);
  assert.match(source, /"--no-session-persistence"/);
  assert.match(source, /"--permission-mode", "dontAsk"/);
  assert.match(source, /"--max-turns"/);
  assert.match(source, /"--max-budget-usd"/);
  assert.match(source, /automaticRestart: "disabled"/);
  assert.doesNotMatch(source, /node:child_process|\b(?:spawn|exec|fork|shell)\s*\(/);
  assert.doesNotMatch(source, /--continue|--resume|--remote|--remote-control|bypassPermissions|dangerously-skip-permissions|--allowedTools/);
  assert.doesNotMatch(source, /recordEvent|updateRun|updateTask|Coordinator/);
});
