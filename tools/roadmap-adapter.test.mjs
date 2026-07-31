import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

describe("Roadmap adapter boundary", () => {
  it("pins the independent Roadmap protocol and excludes worktree/agent side effects", async () => {
    const manifest = await read("config/roadmap-adapter.manifest.yaml");
    for (const marker of [
      'package: "@connorbritain/roadmap"',
      'version: "0.4.0"',
      "surface: mcp-read-tools",
      "tools: [plan, show]",
      "physical_worktree_preparation: separately-authorized",
      "agent_launch: forbidden",
      "roadmap_graph_reimplementation: forbidden",
    ]) {
      assert.ok(manifest.includes(marker), `missing manifest marker: ${marker}`);
    }
  });
});
