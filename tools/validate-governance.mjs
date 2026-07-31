import { readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectHistoricalPaths,
  collectRepositoryPaths,
  collectRefNames,
  commitHasDeclaredEncoding,
  containsPrivateDenylistValue,
  createIncrementalGuardScanner,
  decodeForGuard,
  findCredentialSignals,
  historicalObjectContentForScan,
  historicalObjectNeedsContentScan,
  mayContainLegacyEncodedDenylistValue,
  parseHistoricalObjectLine,
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

const required = [
  "docs/specs/catalog.yaml",
  "docs/acceptance/v1-capabilities.yaml",
  "docs/traceability/phase-0.yaml",
  "docs/traceability/phase-2-durable-core.yaml",
  "docs/traceability/phase-3-worker-runtime-core.yaml",
  "docs/traceability/phase-3-worker-safety-hooks.yaml",
  "docs/traceability/phase-3-worker-service-packaging.yaml",
  "docs/traceability/phase-4-roadmap-adapter.yaml",
  "docs/traceability/phase-4-print-provider.yaml",
  "docs/traceability/phase-5-first-cli-provider-spike.yaml",
  "docs/traceability/phase-5-first-cli-provider.yaml",
  "docs/traceability/phase-6-coordinator-runtime.yaml",
  "docs/traceability/phase-6-slack-attention-adapter.yaml",
  "docs/traceability/phase-6-verified-draft-delivery.yaml",
  "docs/traceability/phase-7-second-cli-provider.yaml",
  "docs/traceability/phase-7-github-portfolio-projections.yaml",
  "docs/traceability/phase-8-skills-estimation-finops.yaml",
  "docs/traceability/phase-8-release-recovery.yaml",
  "docs/traceability/v1-requirements.yaml",
  "docs/status/current.md",
  "docs/status/blockers.md",
  "docs/status/known-gaps.md",
  "docs/roadmap/roadmap.yaml",
  "docs/roadmap/backlog.yaml",
  "docs/architecture/monorepo-boundaries.md",
  "docs/architecture/contracts.md",
  "docs/architecture/codex-app-server-provider.md",
  "docs/architecture/claude-code-provider.md",
  "docs/architecture/github-portfolio-projections.md",
  "docs/architecture/portable-skills-and-finops.md",
  "docs/architecture/release-recovery.md",
  "docs/architecture/coordinator-runtime.md",
  "docs/architecture/verified-draft-delivery.md",
  "docs/architecture/remote-access.md",
  "docs/adr/ADR-0009-independent-safety-monitor-and-dry-run-remediation.md",
  "docs/adr/ADR-0010-supervisor-only-service-packaging.md",
  "docs/adr/ADR-0011-roadmap-readiness-and-worktree-intent.md",
  "docs/adr/ADR-0012-print-provider-no-execution-reference.md",
  "docs/adr/ADR-0013-codex-app-server-first-cli-provider.md",
  "docs/adr/ADR-0014-coordinator-durable-intent-and-attention-boundary.md",
  "docs/adr/ADR-0016-replayable-independent-verification-before-draft-delivery.md",
  "docs/adr/ADR-0017-claude-code-second-cli-provider.md",
  "docs/adr/ADR-0018-outbox-projections-are-non-authoritative.md",
  "docs/adr/ADR-0019-portable-skills-and-independent-finops-lineage.md",
  "docs/adr/ADR-0020-release-compatibility-and-recovery-are-recorded-human-gates.md",
  "config/roadmap-adapter.manifest.yaml",
  "config/release-recovery.manifest.yaml",
  "deploy/release-recovery/manifest.yaml",
  "deploy/release-recovery/README.md",
  "docs/runbooks/release-recovery.md",
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

const files = await collectRepositoryPaths(root);
const rootBytes = Buffer.from(root);
const filesystemSeparator = Buffer.from(path.sep);
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

const scanHistoricalPath = (historicalPath) => {
  const rawPath = Buffer.isBuffer(historicalPath)
    ? historicalPath
    : Buffer.from(historicalPath);
  const displayPath = rawPath.toString("utf8");
  const representations = decodeForGuard(rawPath);
  for (const representation of representations) {
    if (/\.(?:docx|docm|pdf|key|pem|p12|pfx|kdbx)$/i.test(representation)) {
      errors.push(`Forbidden artifact exists in public Git history: ${displayPath}`);
      break;
    }
  }
  for (const representation of representations) {
    if (
      /(^|\/)\.env($|\.)/i.test(representation) &&
      !representation.endsWith(".env.example")
    ) {
      errors.push(`Raw environment file exists in public Git history: ${displayPath}`);
      break;
    }
  }
  scanContent(
    rawPath,
    `Git history path ${displayPath}`
  );
};

for (const relative of files) {
  const displayPath = relative.toString("utf8").replaceAll(path.sep, "/");
  const pathRepresentations = decodeForGuard(relative);
  if (pathRepresentations.some((value) => /\.(docx|docm|pdf)$/i.test(value))) errors.push(`Private document artifact is not allowed: ${displayPath}`);
  if (pathRepresentations.some((value) => /\.(?:key|pem|p12|pfx|kdbx)$/i.test(value))) errors.push(`Credential-bearing file type is not allowed: ${displayPath}`);
  if (pathRepresentations.some((value) => /(^|\/)\.env($|\.)/i.test(value) && !value.endsWith(".env.example"))) errors.push(`Raw environment file is not allowed: ${displayPath}`);
  scanContent(relative, `repository path ${displayPath}`);
  const absolutePath = Buffer.concat([
    rootBytes,
    filesystemSeparator,
    relative
  ]);
  const content = await readRepositoryEntry(absolutePath);
  scanContent(content, displayPath);
}

const collectHistoricalObjectLocations = async () => {
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
  const objectLocations = new Map();
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of lines) {
    const { objectId, historicalPath } = parseHistoricalObjectLine(line);
    if (!historicalPath) {
      if (!objectLocations.has(objectId)) {
        objectLocations.set(objectId, "<pathless object>");
      }
      continue;
    }
    if (!objectLocations.has(objectId)) {
      objectLocations.set(objectId, historicalPath);
    }
  }
  const exitCode = await completion;
  if (exitCode === 0) return objectLocations;
  if (/not a git repository/i.test(stderr)) {
    warnings.push("Public Git history inspection skipped because Git metadata is unavailable.");
    return new Map();
  }
  throw new Error(stderr.trim() || `git rev-list exited with code ${exitCode}`);
};

const scanHistoricalObjects = async (objectLocations) => {
  if (!objectLocations.size) return;
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
    for (const objectId of objectLocations.keys()) {
      if (!child.stdin.write(`${objectId}\n`)) await once(child.stdin, "drain");
    }
    child.stdin.end();
  })();

  let headerParts = [];
  let pending;
  const finishPendingContent = () => {
    const historicalPath = objectLocations.get(pending.objectId) ?? "<unknown>";
    const location =
      `Git history ${pending.type} ${pending.objectId} (${historicalPath})`;
    if (pending.scanner) {
      const findings = pending.scanner.finish();
      if (findings.privateValue) {
        errors.push(`Private deployment denylist value found in ${location}`);
      }
      for (const signal of findings.credentialSignals) {
        errors.push(`Credential signal ${signal} found in ${location}`);
      }
    } else if (historicalObjectNeedsContentScan(pending.type)) {
      const content = Buffer.concat(pending.parts, pending.size);
      if (
        (
          pending.type === "tag" ||
          (pending.type === "commit" && !commitHasDeclaredEncoding(content))
        ) &&
        mayContainLegacyEncodedDenylistValue(content, privateDenylist)
      ) {
        errors.push(
          `Potential legacy-encoded private denylist value found in ${location}`
        );
      }
      scanContent(historicalObjectContentForScan(content, pending.type), location);
    }
    pending.awaitingDelimiter = true;
  };

  for await (const chunk of child.stdout) {
    let offset = 0;
    while (offset < chunk.length) {
      if (!pending) {
        const newline = chunk.indexOf(0x0a, offset);
        if (newline < 0) {
          headerParts.push(Buffer.from(chunk.subarray(offset)));
          offset = chunk.length;
          continue;
        }
        headerParts.push(Buffer.from(chunk.subarray(offset, newline)));
        const header = Buffer.concat(headerParts).toString("utf8");
        headerParts = [];
        offset = newline + 1;
        const match = /^([0-9a-f]+) ([a-z]+) (\d+)$/.exec(header);
        if (!match) throw new Error(`Unexpected git cat-file header: ${header}`);
        const type = match[2];
        pending = {
          objectId: match[1],
          type,
          size: Number.parseInt(match[3], 10),
          remaining: Number.parseInt(match[3], 10),
          awaitingDelimiter: false,
          parts: [],
          scanner: type === "blob"
            ? createIncrementalGuardScanner(privateDenylist)
            : undefined
        };
      }
      if (pending.awaitingDelimiter) {
        if (chunk[offset] !== 0x0a) {
          throw new Error(
            `Missing delimiter after git object ${pending.objectId}`
          );
        }
        offset += 1;
        pending = undefined;
        continue;
      }
      if (pending.remaining === 0) {
        finishPendingContent();
        continue;
      }
      const length = Math.min(pending.remaining, chunk.length - offset);
      const part = chunk.subarray(offset, offset + length);
      if (pending.scanner) {
        pending.scanner.write(part);
      } else if (historicalObjectNeedsContentScan(pending.type)) {
        pending.parts.push(Buffer.from(part));
      }
      pending.remaining -= length;
      offset += length;
      if (pending.remaining === 0) finishPendingContent();
    }
  }
  await feed;
  const exitCode = await completion;
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `git cat-file exited with code ${exitCode}`);
  }
  if (pending || headerParts.length) {
    throw new Error("Incomplete response from git cat-file --batch");
  }
};

try {
  for (const refName of await collectRefNames(root)) {
    const rawRefName = Buffer.isBuffer(refName)
      ? refName
      : Buffer.from(refName);
    scanContent(rawRefName, `Git ref ${rawRefName.toString("utf8")}`);
  }
  for (const historicalPath of await collectHistoricalPaths(root)) {
    scanHistoricalPath(historicalPath);
  }
  await scanHistoricalObjects(await collectHistoricalObjectLocations());
} catch (error) {
  if (/not a git repository/i.test(error.message)) {
    warnings.push("Public Git history inspection skipped because Git metadata is unavailable.");
  } else {
    errors.push(`Unable to inspect public Git history: ${error.message}`);
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
const phase2Traceability = await readFile(path.join(root, "docs/traceability/phase-2-durable-core.yaml"), "utf8");
const phase3Traceability = await readFile(path.join(root, "docs/traceability/phase-3-worker-runtime-core.yaml"), "utf8");
const phase3SafetyTraceability = await readFile(path.join(root, "docs/traceability/phase-3-worker-safety-hooks.yaml"), "utf8");
const phase3ServiceTraceability = await readFile(path.join(root, "docs/traceability/phase-3-worker-service-packaging.yaml"), "utf8");
const phase4RoadmapTraceability = await readFile(path.join(root, "docs/traceability/phase-4-roadmap-adapter.yaml"), "utf8");
const phase4PrintTraceability = await readFile(path.join(root, "docs/traceability/phase-4-print-provider.yaml"), "utf8");
const phase6CoordinatorTraceability = await readFile(path.join(root, "docs/traceability/phase-6-coordinator-runtime.yaml"), "utf8");
const phase6SlackTraceability = await readFile(path.join(root, "docs/traceability/phase-6-slack-attention-adapter.yaml"), "utf8");
const phase6VerifiedDraftTraceability = await readFile(path.join(root, "docs/traceability/phase-6-verified-draft-delivery.yaml"), "utf8");
const phase7SecondProviderTraceability = await readFile(path.join(root, "docs/traceability/phase-7-second-cli-provider.yaml"), "utf8");
const phase7ProjectionsTraceability = await readFile(path.join(root, "docs/traceability/phase-7-github-portfolio-projections.yaml"), "utf8");
const phase8SkillsFinopsTraceability = await readFile(path.join(root, "docs/traceability/phase-8-skills-estimation-finops.yaml"), "utf8");
const phase8ReleaseRecoveryTraceability = await readFile(path.join(root, "docs/traceability/phase-8-release-recovery.yaml"), "utf8");
const v1Traceability = await readFile(path.join(root, "docs/traceability/v1-requirements.yaml"), "utf8");
const roadmap = await readFile(path.join(root, "docs/roadmap/roadmap.yaml"), "utf8");
const roadmapSlices = new Set(
  [...roadmap.matchAll(/^\s*invoke:\s*([a-z0-9-]+)\s*$/gm)]
    .map((match) => match[1])
);
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
const acceptanceCompletionRoutes = new Map();
for (const route of acceptanceRoutes) {
  if (routedAcceptanceIds.has(route.acceptance)) {
    errors.push(`Duplicate explicit acceptance route: ${route.acceptance}`);
  }
  routedAcceptanceIds.add(route.acceptance);
  acceptanceCompletionRoutes.set(route.acceptance, route);
  if (!acceptanceRequirements.has(route.acceptance)) {
    errors.push(`Acceptance route is absent from catalog: ${route.acceptance}`);
  }
  if (!roadmapSlices.has(route.slice)) {
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
const completedEvidence = `${traceability}\n${phase2Traceability}\n${phase3Traceability}\n${phase3SafetyTraceability}\n${phase3ServiceTraceability}\n${phase4RoadmapTraceability}\n${phase4PrintTraceability}\n${phase6CoordinatorTraceability}\n${phase6SlackTraceability}\n${phase6VerifiedDraftTraceability}\n${phase7SecondProviderTraceability}\n${phase7ProjectionsTraceability}\n${phase8SkillsFinopsTraceability}\n${phase8ReleaseRecoveryTraceability}`;
for (const entry of traceabilityEntries) {
  if (tracedIds.has(entry.id)) errors.push(`Duplicate traceability entry: ${entry.id}`);
  tracedIds.add(entry.id);
  for (const marker of [
    `  - id: ${entry.id}`,
    `    owner: ${entry.owner}`,
    `    slice: ${entry.slice}`,
    `    acceptance: ${entry.acceptance}`,
    `    status: ${entry.status}`,
    `    route_role: ${entry.routeRole}`
  ]) {
    if (!v1Traceability.includes(marker)) errors.push(`Traceability report is missing ${marker.trim()}`);
  }
  if (!roadmapSlices.has(entry.slice)) {
    errors.push(`Traceability slice is absent from Roadmap: ${entry.slice}`);
  }
  const acceptedRequirements = acceptanceRequirements.get(entry.acceptance);
  if (!acceptedRequirements) errors.push(`Traceability acceptance is absent from catalog: ${entry.acceptance}`);
  else if (!acceptedRequirements.has(entry.id)) {
    errors.push(`Acceptance ${entry.acceptance} does not include routed requirement ${entry.id}`);
  }
  const acceptanceCompletion =
    acceptanceCompletionRoutes.get(entry.acceptance);
  if (acceptanceCompletion) {
    const expectedRole = (
      entry.slice === acceptanceCompletion.slice &&
      entry.test === acceptanceCompletion.test
    )
      ? "completion"
      : "contributing";
    if (entry.routeRole !== expectedRole) {
      errors.push(
        `Traceability route role for ${entry.id} must be ${expectedRole}`
      );
    }
  }
  if (entry.coverage) {
    if (entry.coveragePolicy !== "all") {
      errors.push(`Traceability coverage policy must be all for ${entry.id}`);
    }
    for (const coverage of entry.coverage) {
      if (!roadmapSlices.has(coverage.slice)) {
        errors.push(
          `Traceability coverage slice is absent from Roadmap for ${entry.id}: ${coverage.slice}`
        );
      }
      const coverageRequirements =
        acceptanceRequirements.get(coverage.acceptance);
      if (!coverageRequirements) {
        errors.push(
          `Traceability coverage acceptance is absent from catalog for ${entry.id}: ${coverage.acceptance}`
        );
      } else if (!coverageRequirements.has(entry.id)) {
        errors.push(
          `Acceptance ${coverage.acceptance} does not include covered requirement ${entry.id}`
        );
      }
      for (const marker of [
        `      - slice: ${coverage.slice}`,
        `        acceptance: ${coverage.acceptance}`,
        `        status: ${coverage.status}`,
        `        test: ${JSON.stringify(coverage.test)}`
      ]) {
        if (!v1Traceability.includes(marker)) {
          errors.push(
            `Traceability report is missing coverage for ${entry.id}: ${marker.trim()}`
          );
        }
      }
    }
    if (
      entry.status === "complete" &&
      entry.coverage.some((coverage) => coverage.status !== "complete")
    ) {
      errors.push(
        `Requirement is complete before all traceability coverage is complete: ${entry.id}`
      );
    }
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
