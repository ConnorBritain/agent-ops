import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const adr = await readFile(
  new URL("../docs/adr/ADR-0013-codex-app-server-first-cli-provider.md", import.meta.url),
  "utf8",
);

test("first CLI provider selection keeps the Codex control surface local and bounded", () => {
  assert.match(adr, /codex app-server --listen stdio:\/\//);
  assert.match(adr, /turn\/steer/);
  assert.match(adr, /turn\/interrupt/);
  assert.match(adr, /pause and resume \| unsupported/i);
  assert.match(adr, /must not use `--listen ws:\/\/`, `--listen wss:\/\/`,\n`--yolo`, a bypass-approval flag/i);
  assert.doesNotMatch(adr, /CODEX_API_KEY\s*=/);
});
