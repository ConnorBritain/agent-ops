import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(new URL("../packages/providers/print/src/index.ts", import.meta.url), "utf8");

test("PrintProvider is statically free of process execution APIs", () => {
  assert.doesNotMatch(source, /node:child_process|\b(?:spawn|exec|fork|shell)\s*\(/);
  assert.doesNotMatch(source, /Bun\.spawn|Deno\.Command|process\.run/);
  assert.match(source, /execution: "not-started"/);
});
