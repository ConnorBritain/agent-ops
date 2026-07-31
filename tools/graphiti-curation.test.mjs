import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const contracts = await readFile(
  new URL("../packages/contracts/src/index.ts", import.meta.url),
  "utf8",
);
const domain = await readFile(
  new URL("../packages/domain/src/index.ts", import.meta.url),
  "utf8",
);
const adapter = await readFile(
  new URL("../packages/adapters/src/graphiti-curation.ts", import.meta.url),
  "utf8",
);
const testKit = await readFile(
  new URL("../packages/test-kit/src/index.ts", import.meta.url),
  "utf8",
);
const config = await readFile(
  new URL("../config/curated-memory.manifest.yaml", import.meta.url),
  "utf8",
);
const architecture = await readFile(
  new URL("../docs/architecture/curated-memory.md", import.meta.url),
  "utf8",
);
const runbook = await readFile(
  new URL("../docs/runbooks/curated-memory.md", import.meta.url),
  "utf8",
);
const adr = await readFile(
  new URL("../docs/adr/ADR-0022-curated-memory-is-derived-from-accepted-git-records.md", import.meta.url),
  "utf8",
);

test("curated memory keeps ADRs canonical while candidates and derived graph access remain bounded", () => {
  for (const marker of [
    "memoryCandidateSchema",
    "curatedMemorySourceSchema",
    "curatedMemoryRecordSchema",
    "memoryRetrievalQuerySchema",
    "acceptance: z\\.literal\\(\\\"accepted\\\"\\)",
    "Only a human curator may accept canonical memory",
    "CuratedMemoryStore",
    "CuratedMemoryGraphPort",
    "assertCuratedMemoryLineage",
    "assertMemorySupersession",
    "class CuratedMemoryCurationService",
    "recordCandidate",
    "recordAcceptance",
    "recordSupersession",
    "coreOperationBlocked: false",
    "StaticCuratedMemoryGraph",
    "InMemoryCuratedMemoryStore",
  ]) assert.match(`${contracts}\n${domain}\n${adapter}\n${testKit}`, new RegExp(marker));
  assert.match(adapter, /recordCandidate\(candidate\)/);
  const candidateSubmission = adapter.split("async submitCandidate")[1]?.split("async accept")[0] ?? "";
  assert.doesNotMatch(candidateSubmission, /\.index\(/);
});

test("curated memory remains a source-only, non-authoritative graph boundary", () => {
  for (const marker of [
    "canonical_record: git-backed-adrs",
    "backend: optional-separately-authorized",
    "graphiti_compatibility: permitted-not-required",
    "canonical_acceptance: human-curator-only",
    "scheduler_authority: forbidden",
    "authorization_authority: forbidden",
    "graph_retrieval_failure: non-blocking-unavailable",
    "docker_or_graph_service_connection: separately-authorized",
  ]) assert.match(config, new RegExp(marker));
  assert.match(architecture, /Git-backed ADRs remain the canonical architectural record/);
  assert.match(architecture, /no Graphiti SDK, container definition, network client/);
  assert.match(runbook, /Stop before connecting\s+to a graph endpoint/);
  assert.match(runbook, /source-only validation command/);
  assert.match(adr, /Git-backed ADRs are canonical/);
  const curatedMemoryDomain = domain.slice(domain.indexOf("export interface CuratedMemoryStore"));
  for (const source of [curatedMemoryDomain, adapter, testKit]) {
    assert.doesNotMatch(source, /node:fs|node:child_process|node:net|node:http|fetch\s*\(|WebSocket|spawn\s*\(|exec\s*\(|process\.env|setInterval|setTimeout/);
  }
});
