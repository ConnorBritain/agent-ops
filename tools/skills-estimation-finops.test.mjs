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
const coordinator = await readFile(
  new URL("../apps/coordinator/src/index.ts", import.meta.url),
  "utf8",
);
const service = await readFile(
  new URL("../packages/adapters/src/skills-estimation-finops.ts", import.meta.url),
  "utf8",
);
const fixture = await readFile(
  new URL("../packages/adapters/test/skills-estimation-finops.test.ts", import.meta.url),
  "utf8",
);
const coordinatorFixture = await readFile(
  new URL("../apps/coordinator/test/coordinator.test.ts", import.meta.url),
  "utf8",
);

test("portable primitives remain generic, bundle-declared, redacted, and deterministically enforceable", () => {
  for (const marker of [
    "portablePrimitiveSchema",
    "primitiveBundleManifestSchema",
    "primitiveEnforcementSchema",
    "assertPortablePrimitiveBundle",
    "workerSkillBundleManifestEntrySchema",
  ]) {
    assert.match(contracts, new RegExp(marker));
  }
  assert.match(contracts, /Worker skill must be declared by its installed bundle/);
  assert.match(contracts, /must not embed host, session, credential, or secret facts/);
  assert.match(contracts, /deterministic-code/);
  assert.match(domain, /skillVersionSatisfies/);
  assert.match(domain, /missing-enforced-skill/);
  assert.match(domain, /incompatible-enforced-skill/);
  assert.match(coordinator, /requiredSkills: envelope\.requiredSkills/);
  assert.match(service, /redactOperationalDetail/);
  assert.match(service, /assertNoInlineSecrets\(input\)/);
  assert.doesNotMatch(service, /node:fs|node:child_process|node:net|node:http|fetch\s*\(|process\.env|spawn\s*\(|setInterval|setTimeout/);
});

test("independent estimation and FinOps retain distinct, source-only lineage", () => {
  for (const marker of [
    "estimateRangeSchema",
    "estimateRecordSchema",
    "effortMeasurementSchema",
    "rateCardSchema",
    "allocationRecordSchema",
    "planningFeedbackSchema",
  ]) {
    assert.match(contracts, new RegExp(marker));
  }
  assert.match(contracts, /accountingSystemOfRecord: z\.literal\("external"\)/);
  assert.match(domain, /interface FinOpsLedgerStore/);
  assert.match(domain, /assertFinOpsLineage/);
  assert.match(service, /IndependentEstimatorTransport/);
  assert.match(service, /does not calculate estimates, own calibration history, or translate/);
  assert.match(service, /no background loop, billing call, installation command, or host mutation/);
  for (const evidence of [
    "agent-execution",
    "human-attention",
    "blocked",
    "verification",
    "fully-loaded",
    "human-inclusive",
    "failure-adjusted",
    "relativePoints",
  ]) {
    assert.match(fixture, new RegExp(evidence));
  }
  assert.match(fixture, /refuses an absent enforced primitive/);
  assert.match(coordinatorFixture, /rejects missing or incompatible enforced skills/);
  assert.doesNotMatch(fixture, /https?:\/\/|process\.env|child_process|spawn\s*\(/);
});
