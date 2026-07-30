import { readdir, readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  containsPrivateDenylistValue,
  findCredentialSignals,
  readRepositoryEntry
} from "./public-data-guard.mjs";
import { documents } from "./specifications.mjs";
import {
  acceptanceRoutes,
  traceabilityEntries
} from "./traceability.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];
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
  "docs/traceability/v1-requirements.yaml",
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
const privateDenylist = (process.env.AGENTOPS_PRIVATE_DENYLIST ?? "")
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter(Boolean);
if (privateDenylist.some((value) => value.length < 3)) {
  errors.push("Private guard denylist values must contain at least three characters.");
}

const scanContent = (content, location) => {
  if (containsPrivateDenylistValue(content, privateDenylist)) {
    errors.push(`Private deployment denylist value found in ${location}`);
  }
  for (const signal of findCredentialSignals(content)) {
    errors.push(`Credential signal ${signal} found in ${location}`);
  }
};

for (const relative of files) {
  const normalized = relative.replaceAll(path.sep, "/");
  if (/\.(docx|docm|pdf)$/i.test(normalized)) errors.push(`Private document artifact is not allowed: ${normalized}`);
  if (/\.(?:key|pem|p12|pfx|kdbx)$/i.test(normalized)) errors.push(`Credential-bearing file type is not allowed: ${normalized}`);
  if (/(^|\/)\.env($|\.)/i.test(normalized) && !normalized.endsWith(".env.example")) errors.push(`Raw environment file is not allowed: ${normalized}`);
  scanContent(Buffer.from(normalized), `repository path ${normalized}`);
  const content = await readRepositoryEntry(path.join(root, relative));
  scanContent(content, normalized);
}

const collectHistoricalBlobPaths = async () => {
  const child = spawn("git", ["rev-list", "--objects", "--all"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  const objectPaths = new Map();
  const scannedHistoricalPaths = new Set();
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of lines) {
    const firstSpace = line.indexOf(" ");
    if (firstSpace < 0) continue;
    const objectId = line.slice(0, firstSpace);
    const historicalPath = line.slice(firstSpace + 1);
    if (/\.(?:docx|docm|pdf|key|pem|p12|pfx|kdbx)$/i.test(historicalPath)) {
      errors.push(`Forbidden artifact exists in public Git history: ${historicalPath}`);
    }
    if (/(^|\/)\.env($|\.)/i.test(historicalPath) && !historicalPath.endsWith(".env.example")) {
      errors.push(`Raw environment file exists in public Git history: ${historicalPath}`);
    }
    if (!scannedHistoricalPaths.has(historicalPath)) {
      scannedHistoricalPaths.add(historicalPath);
      scanContent(
        Buffer.from(historicalPath),
        `Git history path ${historicalPath}`
      );
    }
    if (!objectPaths.has(objectId)) {
      objectPaths.set(objectId, historicalPath);
    }
  }
  const exitCode = await completion;
  if (exitCode === 0) return objectPaths;
  if (/not a git repository/i.test(stderr)) {
    warnings.push("Public Git history inspection skipped because Git metadata is unavailable.");
    return new Map();
  }
  throw new Error(stderr.trim() || `git rev-list exited with code ${exitCode}`);
};

const scanHistoricalBlobs = async (objectPaths) => {
  if (!objectPaths.size) return;
  const child = spawn("git", ["cat-file", "--batch"], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  const feed = (async () => {
    for (const objectId of objectPaths.keys()) {
      if (!child.stdin.write(`${objectId}\n`)) await once(child.stdin, "drain");
    }
    child.stdin.end();
  })();

  let buffer = Buffer.alloc(0);
  let pending;
  for await (const chunk of child.stdout) {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      if (!pending) {
        const newline = buffer.indexOf(0x0a);
        if (newline < 0) break;
        const header = buffer.subarray(0, newline).toString("utf8");
        buffer = buffer.subarray(newline + 1);
        const match = /^([0-9a-f]+) ([a-z]+) (\d+)$/.exec(header);
        if (!match) throw new Error(`Unexpected git cat-file header: ${header}`);
        pending = {
          objectId: match[1],
          type: match[2],
          size: Number.parseInt(match[3], 10)
        };
      }
      if (buffer.length < pending.size + 1) break;
      const content = buffer.subarray(0, pending.size);
      buffer = buffer.subarray(pending.size + 1);
      if (pending.type === "blob") {
        const historicalPath = objectPaths.get(pending.objectId) ?? "<unknown>";
        scanContent(
          content,
          `Git history blob ${pending.objectId} (${historicalPath})`
        );
      }
      pending = undefined;
    }
  }
  await feed;
  const exitCode = await completion;
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `git cat-file exited with code ${exitCode}`);
  }
  if (pending || buffer.length) {
    throw new Error("Incomplete response from git cat-file --batch");
  }
};

try {
  await scanHistoricalBlobs(await collectHistoricalBlobPaths());
} catch (error) {
  errors.push(`Unable to inspect public Git history: ${error.message}`);
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
const phase2Traceability = await readFile(path.join(root, "docs/traceability/phase-2-durable-core.yaml"), "utf8");
const v1Traceability = await readFile(path.join(root, "docs/traceability/v1-requirements.yaml"), "utf8");
const roadmap = await readFile(path.join(root, "docs/roadmap/roadmap.yaml"), "utf8");
const acceptanceRequirements = new Map();
let acceptanceId;
for (const line of acceptance.split("\n")) {
  const idMatch = /^  - id: (ACC-[A-Z0-9-]+)$/.exec(line);
  if (idMatch) {
    acceptanceId = idMatch[1];
    continue;
  }
  const requirementsMatch = /^    requirements: \[(.*)\]$/.exec(line);
  if (acceptanceId && requirementsMatch) {
    const ids = requirementsMatch[1].split(",").map((id) => id.trim()).filter(Boolean);
    acceptanceRequirements.set(acceptanceId, new Set(ids));
  }
}
for (const requirement of ["REQ-BUILD-001", "REQ-BUILD-002", "REQ-BUILD-005", "REQ-CATALOG-001", "REQ-CATALOG-002"]) {
  if (!traceability.includes(requirement)) errors.push(`Phase 0 traceability is missing ${requirement}`);
}
if (!acceptance.includes("ACC-GOV-001")) errors.push("Acceptance catalog is missing ACC-GOV-001");

const routedAcceptanceIds = new Set();
for (const route of acceptanceRoutes) {
  if (routedAcceptanceIds.has(route.acceptance)) {
    errors.push(`Duplicate explicit acceptance route: ${route.acceptance}`);
  }
  routedAcceptanceIds.add(route.acceptance);
  if (!acceptanceRequirements.has(route.acceptance)) {
    errors.push(`Acceptance route is absent from catalog: ${route.acceptance}`);
  }
  if (!roadmap.includes(`invoke: ${route.slice}`)) {
    errors.push(`Acceptance route slice is absent from Roadmap: ${route.slice}`);
  }
  for (const marker of [
    `  - id: ${route.acceptance}`,
    `    slice: ${route.slice}`,
    `    status: ${route.status}`,
    `    test: ${JSON.stringify(route.test)}`
  ]) {
    if (!v1Traceability.includes(marker)) {
      errors.push(`Traceability report is missing acceptance route ${marker.trim()}`);
    }
  }
}
for (const acceptanceCatalogId of acceptanceRequirements.keys()) {
  if (!routedAcceptanceIds.has(acceptanceCatalogId)) {
    errors.push(`Acceptance scenario has no explicit slice/test route: ${acceptanceCatalogId}`);
  }
}

const tracedIds = new Set();
const completedEvidence = `${traceability}\n${phase2Traceability}`;
for (const entry of traceabilityEntries) {
  if (tracedIds.has(entry.id)) errors.push(`Duplicate traceability entry: ${entry.id}`);
  tracedIds.add(entry.id);
  for (const marker of [
    `  - id: ${entry.id}`,
    `    owner: ${entry.owner}`,
    `    slice: ${entry.slice}`,
    `    acceptance: ${entry.acceptance}`,
    `    status: ${entry.status}`
  ]) {
    if (!v1Traceability.includes(marker)) errors.push(`Traceability report is missing ${marker.trim()}`);
  }
  if (!roadmap.includes(`invoke: ${entry.slice}`)) errors.push(`Traceability slice is absent from Roadmap: ${entry.slice}`);
  const acceptedRequirements = acceptanceRequirements.get(entry.acceptance);
  if (!acceptedRequirements) errors.push(`Traceability acceptance is absent from catalog: ${entry.acceptance}`);
  else if (!acceptedRequirements.has(entry.id)) {
    errors.push(`Acceptance ${entry.acceptance} does not include routed requirement ${entry.id}`);
  }
  if (entry.status === "complete" && !completedEvidence.includes(entry.id)) {
    errors.push(`Requirement is marked complete without completed-slice evidence: ${entry.id}`);
  }
  if (entry.status !== "complete" && completedEvidence.includes(entry.id)) {
    errors.push(`Completed-slice evidence is not reflected in v1 traceability status: ${entry.id}`);
  }
}
for (const id of requirementIds) {
  if (!tracedIds.has(id)) errors.push(`Requirement has no slice/test traceability: ${id}`);
}
if (tracedIds.size !== requirementIds.size) {
  errors.push(`Traceability covers ${tracedIds.size} requirements but specifications declare ${requirementIds.size}`);
}

for (const warning of warnings) console.warn(`Governance validation warning: ${warning}`);
if (errors.length) {
  console.error("Governance validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Governance validation passed for ${documents.length} specifications and ${requirementIds.size} requirements.`);
}
