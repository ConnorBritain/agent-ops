import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const contracts = await readFile(
  new URL("../packages/contracts/src/index.ts", import.meta.url),
  "utf8",
);
const delivery = await readFile(
  new URL("../packages/adapters/src/verified-draft-delivery.ts", import.meta.url),
  "utf8",
);
const adapterTests = await readFile(
  new URL("../packages/adapters/test/verified-draft-delivery.test.ts", import.meta.url),
  "utf8",
);
const scenario = await readFile(
  new URL("../apps/coordinator/test/verified-draft-delivery.test.ts", import.meta.url),
  "utf8",
);

test("verified draft delivery remains durable, independently verified, and draft-only", () => {
  assert.match(contracts, /verificationRecordSchema/);
  assert.match(contracts, /draftPullRequestIntentSchema/);
  assert.match(contracts, /draft:\s*z\.literal\(true\)/);
  for (const boundary of ["store.reserve", "verifier.verify", "store.recordVerification", "policy.evaluate", "store.recordGate", "gateway.createDraft", "store.complete"]) {
    assert.match(delivery, new RegExp(boundary.replaceAll(".", "\\.")));
  }
  const serviceBody = delivery.slice(delivery.indexOf("async deliver"));
  const reserve = serviceBody.indexOf("store.reserve");
  const verify = serviceBody.indexOf("verifier.verify");
  const recordVerification = serviceBody.indexOf("store.recordVerification");
  const evaluatePolicy = serviceBody.indexOf("policy.evaluate");
  const recordAllowGate = serviceBody.indexOf("store.recordGate", evaluatePolicy);
  const createDraft = serviceBody.indexOf("gateway.createDraft", recordAllowGate);
  const completeDraft = serviceBody.indexOf("store.complete", createDraft);
  assert.ok([reserve, verify, recordVerification, evaluatePolicy, recordAllowGate, createDraft, completeDraft].every((offset) => offset >= 0));
  assert.ok(reserve < verify && verify < recordVerification && recordVerification < evaluatePolicy);
  assert.ok(evaluatePolicy < recordAllowGate && recordAllowGate < createDraft && createDraft < completeDraft);
  assert.match(delivery, /verification\.verdict !== "pass"/);
  assert.match(delivery, /policyDecision\.decision === "allow"/);
  assert.doesNotMatch(delivery, /node:http|node:net|@octokit|fetch\s*\(|process\.env|setInterval|setTimeout/);
  assert.doesNotMatch(delivery, /createPullRequest|mergePullRequest|release\s*\(/);
});

test("the deterministic vertical fixture proves durable answer, retained-run resume, verifier separation, and replay", () => {
  assert.match(adapterTests, /blocks a draft when the independent verdict is not pass/);
  assert.match(adapterTests, /blocks a draft when a matching delivery policy does not allow it/);
  assert.match(scenario, /"attention-response"[\s\S]*"job"[\s\S]*"provider-acknowledgement"/);
  assert.match(scenario, /assert\.equal\(coordinatorStore\.jobs\[0\]\?\.envelope\.runId, testIds\.run\)/);
  assert.match(scenario, /assert\.notDeepEqual\(deliveryStore\.verifications\[0\], providerObservation\)/);
  assert.match(scenario, /assert\.deepEqual\(replay, first\)/);
  assert.match(scenario, /assert\.equal\(gateway\.intents\.length, 1\)/);
  assert.doesNotMatch(scenario, /https?:\/\/|process\.env|child_process|spawn\s*\(/);
});
