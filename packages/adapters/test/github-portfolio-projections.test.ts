import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GitHubPortfolioProjectionService } from "../src/index.ts";
import {
  DeterministicClock,
  InMemoryExternalProjectionOutbox,
  RecordingGitHubProjectionGateway,
  RecordingPortfolioProjectionGateway,
  testIds,
} from "@agent-ops/test-kit";
import type {
  CoordinatorProjectionCommand,
  ExternalProjectionIntent,
} from "@agent-ops/contracts";

const links = [
  { kind: "issue", system: "github", externalRef: "github://fixture/issues/1" },
  { kind: "slice", system: "roadmap", externalRef: "roadmap://phase-7/projections" },
  { kind: "pull-request", system: "github", externalRef: "github://fixture/pulls/1" },
  { kind: "external-session", system: "external", externalRef: "external://fixture/sessions/1" },
] as const;

const portfolioIntent = (
  transition: Extract<ExternalProjectionIntent, { readonly kind: "portfolio-transition" }>["transition"] = "ready-for-review",
): Extract<ExternalProjectionIntent, { readonly kind: "portfolio-transition" }> => ({
  version: "1.0",
  projectionId: testIds.projection,
  idempotencyKey: "projection-fixture-001",
  taskId: testIds.task,
  runId: testIds.run,
  securityDomain: "example-domain",
  kind: "portfolio-transition",
  links: [...links],
  transition,
  summary: "The bounded fixture is ready for independent review.",
  requestedAt: "2026-07-30T04:00:00Z",
});

const githubDraftIntent = (): Extract<ExternalProjectionIntent, {
  readonly kind: "github-draft-pull-request";
}> => ({
  version: "1.0",
  projectionId: testIds.projection,
  idempotencyKey: "projection-fixture-001",
  taskId: testIds.task,
  runId: testIds.run,
  securityDomain: "example-domain",
  kind: "github-draft-pull-request",
  links: [...links],
  repositoryRef: "repo://fixture/agent-ops",
  title: "Fixture draft only",
  verificationId: testIds.verification,
  draft: true,
  requestedAt: "2026-07-30T04:00:00Z",
});

const githubCiEvidenceIntent = (): Extract<ExternalProjectionIntent, {
  readonly kind: "github-ci-evidence";
}> => ({
  version: "1.0",
  projectionId: testIds.projection,
  idempotencyKey: "projection-fixture-001",
  taskId: testIds.task,
  runId: testIds.run,
  securityDomain: "example-domain",
  kind: "github-ci-evidence",
  links: [...links],
  pullRequestRef: "github://fixture/pulls/1",
  evidenceRef: "evidence://fixture/ci/1",
  conclusion: "pass",
  requestedAt: "2026-07-30T04:00:00Z",
});

const command = (projection: ExternalProjectionIntent = portfolioIntent()): CoordinatorProjectionCommand => ({
  version: "1.0",
  commandId: testIds.coordinator,
  actor: {
    id: testIds.coordinator,
    kind: "coordinator",
    securityDomain: "example-domain",
  },
  taskId: testIds.task,
  runId: testIds.run,
  securityDomain: "example-domain",
  projection,
  issuedAt: "2026-07-30T04:00:00Z",
});

const fixture = () => {
  const outbox = new InMemoryExternalProjectionOutbox();
  const github = new RecordingGitHubProjectionGateway();
  const portfolio = new RecordingPortfolioProjectionGateway();
  const service = new GitHubPortfolioProjectionService({
    clock: new DeterministicClock(),
    outbox,
    github,
    portfolio,
  });
  return { github, outbox, portfolio, service };
};

describe("GitHub and portfolio outbox projections", () => {
  it("retains multi-link correlation and provenance on a meaningful portfolio transition", async () => {
    const { outbox, portfolio, service } = fixture();
    const result = await service.submit(command());

    assert.equal(result.disposition, "delivered");
    assert.equal(portfolio.intents.length, 1);
    assert.deepEqual(portfolio.intents[0]?.links, links);
    if (result.disposition !== "delivered") throw new Error("fixture result must be delivered");
    assert.deepEqual(result.fact.source, { kind: "integration", id: "portfolio-projection" });
    assert.equal(result.fact.sourceEventId, "portfolio-projection-event-001");
    assert.equal(result.fact.occurredAt, "2026-07-30T04:00:00Z");
    assert.equal(result.fact.ingestedAt, "2026-07-30T04:00:01Z");
    assert.equal(outbox.records.get(testIds.projection)?.state, "delivered");
  });

  it("suppresses low-value portfolio noise before a durable or external write", async () => {
    const { outbox, portfolio, service } = fixture();
    const result = await service.submit(command(portfolioIntent("running")));

    assert.deepEqual(result, {
      disposition: "suppressed",
      reason: "non-human-scale-transition",
    });
    assert.equal(outbox.records.size, 0);
    assert.equal(portfolio.intents.length, 0);
    assert.deepEqual(outbox.operations, []);
  });

  it("persists a retryable projection through an outage and replays it exactly once", async () => {
    const { github, outbox, service } = fixture();
    const internalOperationalState = { desiredRunState: "ready-for-review" };
    github.throwOnDeliver = true;

    const failed = await service.submit(command(githubDraftIntent()));
    assert.deepEqual(failed, { disposition: "queued", projectionId: testIds.projection });
    assert.deepEqual(internalOperationalState, { desiredRunState: "ready-for-review" });
    assert.deepEqual(outbox.records.get(testIds.projection), {
      command: command(githubDraftIntent()),
      state: "pending",
      attempts: 1,
      lastErrorCode: "external-unavailable",
    });
    assert.equal(github.intents.length, 1);

    github.throwOnDeliver = false;
    const replayed = await service.replay(testIds.projection);
    assert.equal(replayed.disposition, "delivered");
    assert.equal(github.intents.length, 2);
    assert.equal(outbox.records.get(testIds.projection)?.state, "delivered");
    assert.deepEqual(outbox.operations, [
      "projection-reserve",
      "projection-claim",
      "projection-retryable:external-unavailable",
      "projection-claim",
      "projection-delivered",
    ]);
  });

  it("suppresses duplicate external output after a durable successful delivery", async () => {
    const { github, service } = fixture();
    const first = await service.submit(command(githubDraftIntent()));
    const duplicate = await service.submit(command(githubDraftIntent()));

    assert.equal(first.disposition, "delivered");
    assert.deepEqual(duplicate, first);
    assert.equal(github.intents.length, 1);
  });

  it("routes draft-only GitHub and concise portfolio projections through separate named gateways", async () => {
    const { github, portfolio, service } = fixture();
    await service.submit(command(githubDraftIntent()));
    assert.equal(github.intents[0]?.kind, "github-draft-pull-request");
    assert.equal(portfolio.intents.length, 0);
  });

  it("projects independent CI evidence through the same bounded GitHub gateway", async () => {
    const { github, portfolio, service } = fixture();
    const result = await service.submit(command(githubCiEvidenceIntent()));

    assert.equal(result.disposition, "delivered");
    assert.equal(github.intents[0]?.kind, "github-ci-evidence");
    assert.equal(portfolio.intents.length, 0);
  });

  it("rejects a projection that was not issued by the Coordinator", async () => {
    const { outbox, service } = fixture();
    const unauthorized = {
      ...command(),
      actor: { id: testIds.principal, kind: "human", securityDomain: "example-domain" },
    };

    await assert.rejects(() => service.submit(unauthorized), /Coordinator-issued command/);
    assert.equal(outbox.records.size, 0);
  });

  it("retains no malformed or secret-bearing gateway fact in the retryable outbox", async () => {
    const { github, outbox, service } = fixture();
    github.result = {
      version: "1.0",
      projectionId: testIds.projection,
      taskId: testIds.task,
      runId: testIds.run,
      securityDomain: "example-domain",
      system: "github",
      externalRef: "github://fixture/projection/1",
      source: { kind: "integration", id: "github-projection" },
      sourceEventId: "github-projection-event-001",
      occurredAt: "2026-07-30T04:00:00Z",
      ingestedAt: "2026-07-30T04:00:01Z",
      metadata: { apiKey: "inline-value" },
    };

    const result = await service.submit(command(githubDraftIntent()));
    assert.deepEqual(result, { disposition: "queued", projectionId: testIds.projection });
    const record = outbox.records.get(testIds.projection);
    assert.equal(record?.state, "pending");
    assert.equal(record?.lastErrorCode, "protocol-invalid");
    assert.equal(JSON.stringify(record).includes("inline-value"), false);
  });
});
