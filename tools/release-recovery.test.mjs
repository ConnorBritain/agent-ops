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
const testKit = await readFile(
  new URL("../packages/test-kit/src/index.ts", import.meta.url),
  "utf8",
);
const domainFixture = await readFile(
  new URL("../packages/domain/test/domain.test.ts", import.meta.url),
  "utf8",
);
const config = await readFile(
  new URL("../config/release-recovery.manifest.yaml", import.meta.url),
  "utf8",
);
const deployManifest = await readFile(
  new URL("../deploy/release-recovery/manifest.yaml", import.meta.url),
  "utf8",
);
const runbook = await readFile(
  new URL("../docs/runbooks/release-recovery.md", import.meta.url),
  "utf8",
);
const architecture = await readFile(
  new URL("../docs/architecture/release-recovery.md", import.meta.url),
  "utf8",
);

test("release recovery contracts keep compatibility, promotion, migration, backup, replacement, and gates explicit", () => {
  for (const marker of [
    "RELEASE_COMPATIBILITY_COMPONENTS",
    "compatibilityManifestSchema",
    "promotionRecordSchema",
    "migrationGateSchema",
    "backupVerificationRecordSchema",
    "workerReplacementRecordSchema",
    "releaseGateRecordSchema",
    "backwardCompatibility",
    "expand-before-contract",
    "restoration",
  ]) {
    assert.match(contracts, new RegExp(marker));
  }
  assert.match(contracts, /Destructive migration requires backup verification, human approval, and forward repair instructions/);
  assert.match(contracts, /Promotion must follow development -> canary or canary -> stable/);
  assert.match(contracts, /Replacement worker must have a distinct internal identity/);
  assert.match(domain, /assertReleaseCompatibility/);
  assert.match(domain, /assertReleaseRecoveryLineage/);
  assert.match(domain, /Incompatible \$\{declaration\.component\} version/);
  assert.match(domain, /did not preserve the durable ledger/);
  assert.match(domain, /failed redaction verification/);
  assert.match(domain, /unaddressed critical safety test/);
  assert.match(testKit, /InMemoryReleaseRecoveryLedger/);
  assert.match(domainFixture, /development-to-canary-to-stable/);
  assert.match(domainFixture, /blocks schema incompatibility, incomplete backups, ledger loss, failed redaction, and unaddressed safety/);
});

test("release recovery remains a static, separately authorized source boundary", () => {
  for (const marker of [
    "automatic-promotion: forbidden",
    "destructive-migration-without-backup-approval-and-forward-repair: forbidden",
    "replacement-with-ledger-loss: forbidden",
    "deployment_execution: separately-authorized",
    "backup_execution: separately-authorized",
    "migration_execution: separately-authorized",
    "worker_enrollment: separately-authorized",
  ]) {
    assert.match(`${config}\n${deployManifest}`, new RegExp(marker));
  }
  assert.match(runbook, /Stop\s+before connecting to an environment/);
  assert.match(runbook, /source-only validation\s+command/);
  assert.match(architecture, /not\s+a release controller, backup client, migration runner, service installer, or\s+worker enrollment system/);
  assert.doesNotMatch(domain, /node:fs|node:child_process|node:net|node:http|fetch\s*\(|process\.env|spawn\s*\(|setInterval|setTimeout/);
  assert.doesNotMatch(testKit, /node:fs|node:child_process|node:net|node:http|fetch\s*\(|process\.env|spawn\s*\(|setInterval|setTimeout/);
});
