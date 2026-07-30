import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderTraceability } from "./traceability.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "docs/traceability/v1-requirements.yaml");
const expected = renderTraceability();
const check = process.argv.includes("--check");

let current = null;
try {
  current = await readFile(target, "utf8");
} catch {
  // A missing generated artifact is stale.
}

if (current !== expected) {
  if (check) {
    console.error("Generated traceability report is stale: docs/traceability/v1-requirements.yaml");
    process.exitCode = 1;
  } else {
    await writeFile(target, expected);
    console.log("Generated traceability for 130 requirements.");
  }
} else if (!check) {
  console.log("Traceability report is current.");
}
