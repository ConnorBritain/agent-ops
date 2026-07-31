import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const contracts = await readFile(
  new URL("../packages/contracts/src/index.ts", import.meta.url),
  "utf8",
);
const policy = await readFile(
  new URL("../packages/policy/src/index.ts", import.meta.url), "utf8",
);
const provider = await readFile(
  new URL("../packages/providers/observed-browser/src/index.ts", import.meta.url), "utf8",
);
const testKit = await readFile(
  new URL("../packages/test-kit/src/index.ts", import.meta.url), "utf8",
);
const config = await readFile(
  new URL("../config/observed-browser.manifest.yaml", import.meta.url), "utf8",
);
const architecture = await readFile(
  new URL("../docs/architecture/observed-browser-path.md", import.meta.url), "utf8",
);
const runbook = await readFile(
  new URL("../docs/runbooks/observed-browser-path.md", import.meta.url), "utf8",
);

test("observed browser contracts require human maturity, exact domains, explicit authority, and redaction", () => {
  for (const marker of [
    "browserCapabilityDeclarationSchema",
    "browserObservationRequestSchema",
    "browserObservationEvidenceSchema",
    "browserHumanConfirmationSchema",
    "HumanBrowserEvidencePort",
    "autonomousDesktopControl: z\\.literal\\(false\\)",
    "humanConfirmationRequired: z\\.literal\\(true\\)",
    "rawContentRetained: z\\.literal\\(false\\)",
    "redactionVerified: z\\.literal\\(true\\)",
  ]) assert.match(contracts, new RegExp(marker));
  assert.match(policy, /evaluateBrowserObservationPolicy/);
  assert.match(policy, /target-domain-not-allowed/);
  assert.match(policy, /write-authority-observe-only/);
  assert.match(policy, /human-confirmation-recorded/);
  assert.match(policy, /execution: "not-executed"/);
  assert.match(provider, /class ObservedBrowserProvider/);
  assert.match(provider, /readRedactedEvidence/);
  assert.match(provider, /Observed browser sessions do not restart automatically/);
  assert.match(testKit, /StaticHumanBrowserEvidencePort/);
});

test("observed browser remains a static source boundary with no browser or desktop control path", () => {
  for (const marker of [
    "execution_mode: no-execution",
    "automation: none",
    "autonomous_desktop_control: forbidden",
    "browser_input: separately-authorized",
    "remote_desktop_control: forbidden",
    "scheduler_authority: forbidden",
  ]) assert.match(config, new RegExp(marker));
  assert.match(runbook, /Stop\s+before opening a\s+browser/);
  assert.match(runbook, /source-only validation command/);
  assert.match(architecture, /not\s+a browser automation client/);
  assert.match(architecture, /records no click, type, submission/);
  for (const source of [provider, testKit]) {
    assert.doesNotMatch(source, /node:fs|node:child_process|node:net|node:http|fetch\s*\(|WebSocket|spawn\s*\(|exec\s*\(|process\.env|setInterval|setTimeout/);
  }
});
