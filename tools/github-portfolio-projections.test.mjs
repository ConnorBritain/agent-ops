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
const service = await readFile(
  new URL("../packages/adapters/src/github-portfolio-projections.ts", import.meta.url),
  "utf8",
);
const fixture = await readFile(
  new URL("../packages/adapters/test/github-portfolio-projections.test.ts", import.meta.url),
  "utf8",
);

test("GitHub and portfolio projections remain Coordinator-issued, outbox-backed, and bounded", () => {
  for (const schema of [
    "coordinatorProjectionCommandSchema",
    "externalProjectionIntentSchema",
    "externalProjectionFactSchema",
    "projectionLinkSchema",
  ]) {
    assert.match(contracts, new RegExp(schema));
  }
  assert.match(contracts, /kind:\s*z\.literal\("github-draft-pull-request"\)/);
  assert.match(contracts, /kind:\s*z\.literal\("github-ci-evidence"\)/);
  assert.match(contracts, /kind:\s*z\.literal\("portfolio-transition"\)/);
  assert.match(contracts, /External projection requires a Coordinator-issued command/);
  assert.match(domain, /interface ExternalProjectionOutboxStore/);
  for (const boundary of ["outbox.reserve", "outbox.claim", "outbox.markDelivered", "outbox.markRetryable"]) {
    assert.match(service, new RegExp(boundary.replaceAll(".", "\\.")));
  }
  const body = service.slice(service.indexOf("async submit"));
  const reserve = body.indexOf("outbox.reserve");
  const claim = body.indexOf("outbox.claim");
  const deliver = body.indexOf("this.deliver");
  const complete = body.indexOf("outbox.markDelivered");
  assert.ok([reserve, claim, deliver, complete].every((offset) => offset >= 0));
  assert.ok(reserve < claim && claim < deliver && deliver < complete);
  assert.match(service, /meaningfulPortfolioTransitions/);
  assert.doesNotMatch(service, /node:http|node:https|node:net|@octokit|graphql|fetch\s*\(|process\.env|child_process|spawn\s*\(|setInterval|setTimeout/);
  assert.doesNotMatch(service, /createPullRequest|mergePullRequest|dismissReview|createRelease|createDeployment/);
});

test("the deterministic fixtures prove replay, duplicate suppression, outage isolation, provenance, and noise suppression", () => {
  for (const assertion of [
    "retains multi-link correlation and provenance",
    "suppresses low-value portfolio noise",
    "persists a retryable projection through an outage",
    "suppresses duplicate external output",
    "projects independent CI evidence",
    "rejects a projection that was not issued by the Coordinator",
    "retains no malformed or secret-bearing gateway fact",
  ]) {
    assert.match(fixture, new RegExp(assertion));
  }
  assert.match(fixture, /desiredRunState: "ready-for-review"/);
  assert.match(fixture, /lastErrorCode: "external-unavailable"/);
  assert.match(fixture, /lastErrorCode, "protocol-invalid"/);
  assert.doesNotMatch(fixture, /https?:\/\/|process\.env|child_process|spawn\s*\(/);
});
