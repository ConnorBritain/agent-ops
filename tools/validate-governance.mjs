import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { documents } from "./specifications.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const requireFile = async (relative) => {
  try {
    await stat(path.join(root, relative));
  } catch {
    errors.push(`Missing required artifact: ${relative}`);
  }
};

const walk = async (relative = "") => {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) results.push(...await walk(next));
    else results.push(next);
  }
  return results;
};

const required = [
  "docs/specs/catalog.yaml",
  "docs/acceptance/v1-capabilities.yaml",
  "docs/traceability/phase-0.yaml",
  "docs/traceability/phase-2-durable-core.yaml",
  "docs/status/current.md",
  "docs/status/blockers.md",
  "docs/status/known-gaps.md",
  "docs/roadmap/roadmap.yaml",
  "docs/roadmap/backlog.yaml",
  "docs/architecture/monorepo-boundaries.md",
  "docs/architecture/contracts.md",
  "docs/architecture/remote-access.md",
  ".github/workflows/ci.yml"
];
for (const file of required) await requireFile(file);
for (const document of documents) await requireFile(`docs/specs/${document.file}`);
for (let index = 1; index <= 8; index += 1) await requireFile(`docs/adr/ADR-000${index}-${[
  "operational-state-is-durable",
  "policy-precedes-placement",
  "provider-neutral-contracts",
  "versioned-contracts-and-outbox",
  "no-automatic-workload-restart",
  "public-template-private-overlay",
  "managed-remote-access-boundary",
  "phase-zero-has-no-infrastructure-side-effects"
][index - 1]}.md`);

const files = await walk();
const privateSignals = [
  /operator@coordinator-host/i,
  /cre@(worker-host-a|worker-host-b)/i,
  /restricted-host/i,
  /connor\.r\.worker-host-a/i,
  /connor\.worker-host-a@/i,
  /tailscale\s+ip/i,
  /magicdns/i,
  /(xox[baprs]-[A-Za-z0-9-]{20,}|xapp-[A-Za-z0-9-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sb_secret_[A-Za-z0-9_-]{20,})/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
];
for (const relative of files) {
  const normalized = relative.replaceAll(path.sep, "/");
  // The validator contains the detection expressions themselves; it is not deployment data.
  if (normalized === "tools/validate-governance.mjs") continue;
  if (/\.(docx|docm|pdf)$/i.test(normalized)) errors.push(`Private document artifact is not allowed: ${normalized}`);
  if (/(^|\/)\.env($|\.)/i.test(normalized) && !normalized.endsWith(".env.example")) errors.push(`Raw environment file is not allowed: ${normalized}`);
  if (
    normalized !== ".env.example"
    && !/\.(md|ya?ml|json|mjs|ts|yml|sql|toml)$/i.test(normalized)
  ) continue;
  const content = await readFile(path.join(root, relative), "utf8");
  for (const pattern of privateSignals) {
    if (pattern.test(content)) errors.push(`Private deployment signal ${pattern} found in ${normalized}`);
  }
}

const specTexts = await Promise.all(documents.map(async (document) => ({
  document,
  content: await readFile(path.join(root, "docs/specs", document.file), "utf8")
})));
const requirementIds = new Set();
for (const { document, content } of specTexts) {
  for (const marker of [`id: ${document.id}`, "status: draft", "version: 0.1.0", "## Normative requirements", "## Acceptance", "## Change control"]) {
    if (!content.includes(marker)) errors.push(`${document.id} is missing ${marker}`);
  }
  for (const requirement of document.requirements) {
    if (!content.includes(requirement.id)) errors.push(`${document.id} is missing requirement ${requirement.id}`);
    if (requirementIds.has(requirement.id)) errors.push(`Duplicate requirement ID: ${requirement.id}`);
    requirementIds.add(requirement.id);
  }
}

const catalog = await readFile(path.join(root, "docs/specs/catalog.yaml"), "utf8");
for (const document of documents) {
  if (!catalog.includes(`id: ${document.id}`) || !catalog.includes(`path: docs/specs/${document.file}`)) errors.push(`Catalog does not map ${document.id}`);
}

const acceptance = await readFile(path.join(root, "docs/acceptance/v1-capabilities.yaml"), "utf8");
const traceability = await readFile(path.join(root, "docs/traceability/phase-0.yaml"), "utf8");
for (const requirement of ["REQ-BUILD-001", "REQ-BUILD-002", "REQ-BUILD-005", "REQ-CATALOG-001", "REQ-CATALOG-002"]) {
  if (!traceability.includes(requirement)) errors.push(`Phase 0 traceability is missing ${requirement}`);
}
if (!acceptance.includes("ACC-GOV-001")) errors.push("Acceptance catalog is missing ACC-GOV-001");

if (errors.length) {
  console.error("Governance validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Governance validation passed for ${documents.length} specifications and ${requirementIds.size} requirements.`);
}
