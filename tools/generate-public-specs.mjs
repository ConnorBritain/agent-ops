import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { documents, specDirectory } from "./specifications.mjs";

const destination = fileURLToPath(specDirectory);
const requiredMetadata = (document) => [
  "---",
  `id: ${document.id}`,
  "status: draft",
  "version: 0.1.0",
  "audience: public-template",
  "source: generalized-public-adaptation",
  `dependencies: ${document.dependencies.length ? document.dependencies.join(", ") : "none"}`,
  `cross_references: ${document.crossReferences.join(", ")}`,
  "---"
].join("\n");

const render = (document) => [
  requiredMetadata(document),
  "",
  `# ${document.id}: ${document.title}`,
  "",
  "> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.",
  "",
  "## Purpose",
  "",
  document.purpose,
  "",
  ...document.sections.flatMap(([heading, content]) => [`## ${heading}`, "", content, ""]),
  "## Normative requirements",
  "",
  "| ID | Requirement | Evidence |",
  "| --- | --- | --- |",
  ...document.requirements.map(({ id, text, evidence }) => `| ${id} | ${text} | ${evidence} |`),
  "",
  "## Acceptance",
  "",
  document.acceptance,
  "",
  "## Open decisions and assumptions",
  "",
  document.open,
  "",
  "## Change control",
  "",
  "Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.",
  ""
].join("\n");

const catalog = () => [
  "# Generated catalog; edit tools/specifications.mjs and regenerate.",
  "catalog_version: 1",
  "documents:",
  ...documents.flatMap((document) => [
    `  - id: ${document.id}`,
    `    path: docs/specs/${document.file}`,
    "    status: draft",
    "    version: 0.1.0"
  ]),
  ""
].join("\n");

const readme = () => [
  "# AgentOps public specifications",
  "",
  "These Markdown documents are the public, generalized form of the AgentOps architecture. They intentionally omit real hosts, accounts, network topology, credentials, device identifiers, and other private deployment material.",
  "",
  "Regenerate after changing `tools/specifications.mjs` with `pnpm generate:specs`, then run `pnpm validate`.",
  ""
].join("\n");

const expected = new Map([
  ["catalog.yaml", catalog()],
  ["README.md", readme()],
  ...documents.map((document) => [document.file, render(document)])
]);

const check = process.argv.includes("--check");
await mkdir(destination, { recursive: true });
let changed = false;
for (const [name, content] of expected) {
  const path = `${destination}${name}`;
  let current = null;
  try {
    current = await readFile(path, "utf8");
  } catch {
    // A missing generated artifact is handled below.
  }
  if (current !== content) {
    changed = true;
    if (!check) await writeFile(path, content);
    else console.error(`Generated specification is stale: docs/specs/${name}`);
  }
}

if (check && changed) process.exitCode = 1;
if (!check) console.log(`Generated ${expected.size} public specification artifacts.`);
