import { readdir, readFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { documents } from "./specifications.mjs";
import { traceabilityEntries } from "./traceability.mjs";

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
const credentialSignals = [
  /(xox[baprs]-[A-Za-z0-9-]{20,}|xapp-[A-Za-z0-9-]{20,}|gh[opsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{20,})/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
];

// Deployment-specific denylist values are represented only by normalized
// SHA-256 fingerprints. The private overlay owns the source values.
const privateSignalFingerprints = new Set([
  "af25ae8e5f5026e24e5f1d6a5834228c79520d1a559de1097474b9a51e7089c7",
  "29efa084da14779d9c8d7c17b157a39987bc1f2227b536add114a8db275a5224",
  "86c1fbc9d7781525b7668ee5797ef660ba6dcb18936e777df44373eb20ab8ea1",
  "5fc06bb31288eeaba15803fb684498db326b1f95889c6d7f2c4dc4e75138b0a7",
  "ccabfc457cc4fd38652cbc5217b90f03d209d5c7fc2153cd1f810a067b43a436",
  "7c539ac81c9e3b52fdb1802a7676ff00437237a3839a4daf1d6a082dd83fe07f",
  "05191d308ae293f6128269fc11c48b9091871495991e7fb20dee27e4907af107",
  "0eea074b8171553ca883be8b79fcd129bb8660c64b5189d0d7aa3e32ec7de6c3",
  "dc355ec75a2dc4a1d29582933b52f9f2ed71061432d72e1991d8b15445b2ff03",
  "1fc0d6b40ff1d136db81bdd2f0dcc803e68e0230bfe4ecd3ab3bc40d7ebe71c8",
  "cb02ec4f7e1eb7d02d444c5107c920baa0fde2a8e9e4abec48b2b387aa7e3ca9",
  "eba4ae33f54ae0f96bed25bfc13abd887ae157380330cd3fd3f0a4d054ce3a3f",
  "4bcb7b0550a1a810e74944ef9df09ebb3c46e55ca4eee7c0da79afa4a400be59",
  "df62d37bc4ece0a73537b7481196b2321d18390ae71144363c418d3e04806075",
  "62cd5577077ca14b4c7565ad28ad38273dbfd1e92d335e587835f0bed596a99e",
  "55b27f954fbe193902b62810dd17dafb168345fad5e730cc4daca5999e102380",
  "33a8a1c7b8675b32c0df5affc9457dfa6c8d2d12a6320c7a0302accf468332e6",
  "da0ce86fb18621436abd4574e4487392b65abdb53f6fc1f6f49ddd79d546e3ad",
  "7343292dde607b078c62daa569e37624f8b1ada008694832f8b1cc73575e57d6",
  "b3b81badf886d8e1284e1601b1d28b29a8fb32e65db610a0093548110f09e34c",
  "0d7d9de64367c75500472e075dffbcb750e613cb0844b3605a64197f88b46893",
  "be22f6c2ddc00fe49526b8bc7d3ab7bd84a03d27b76be2179ab289f1f72c3625",
  "97a46360b29018a66634e76a18163b63e8e375c04818b2af39fe84cde451adbf",
  "27ec170c79ce3c87f43a8e9e60c3e524368068187f8922601ad7608c90526c67"
]);

const fingerprint = (value) => createHash("sha256").update(value).digest("hex");
const privateFingerprintMatches = (content) => {
  const tokens = content.toLowerCase().match(/[a-z0-9][a-z0-9@._-]*/g) ?? [];
  const candidates = new Set(tokens);
  for (let width = 2; width <= 4; width += 1) {
    for (let index = 0; index + width <= tokens.length; index += 1) {
      candidates.add(tokens.slice(index, index + width).join(" "));
    }
  }
  return [...candidates].some((candidate) => privateSignalFingerprints.has(fingerprint(candidate)));
};

const scanContent = (content, location) => {
  if (privateFingerprintMatches(content)) errors.push(`Private deployment fingerprint found in ${location}`);
  for (const pattern of credentialSignals) {
    if (pattern.test(content)) errors.push(`Credential signal ${pattern} found in ${location}`);
  }
};

const isScannableTextPath = (file) => {
  const base = path.basename(file);
  return (
    base === "LICENSE"
    || base === ".gitignore"
    || base === ".env.example"
    || /\.(md|ya?ml|json|mjs|ts|yml|sql|toml)$/i.test(file)
  );
};

for (const relative of files) {
  const normalized = relative.replaceAll(path.sep, "/");
  if (/\.(docx|docm|pdf)$/i.test(normalized)) errors.push(`Private document artifact is not allowed: ${normalized}`);
  if (/\.(?:key|pem|p12|pfx|kdbx)$/i.test(normalized)) errors.push(`Credential-bearing file type is not allowed: ${normalized}`);
  if (/(^|\/)\.env($|\.)/i.test(normalized) && !normalized.endsWith(".env.example")) errors.push(`Raw environment file is not allowed: ${normalized}`);
  if (!isScannableTextPath(normalized)) continue;
  const content = await readFile(path.join(root, relative), "utf8");
  scanContent(content, normalized);
}

try {
  const historicalObjects = execFileSync("git", ["rev-list", "--objects", "--all"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const scannedBlobs = new Set();
  for (const line of historicalObjects.split("\n")) {
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
    if (
      scannedBlobs.has(objectId)
      || !isScannableTextPath(historicalPath)
    ) continue;
    scannedBlobs.add(objectId);
    const blobType = execFileSync("git", ["cat-file", "-t", objectId], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    if (blobType !== "blob") continue;
    const content = execFileSync("git", ["cat-file", "-p", objectId], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"]
    });
    scanContent(content, `Git history blob ${objectId} (${historicalPath})`);
  }
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

if (errors.length) {
  console.error("Governance validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Governance validation passed for ${documents.length} specifications and ${requirementIds.size} requirements.`);
}
