import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SlackSocketModeAttentionAdapter,
  assertSlackSocketModeConfiguration,
  sanitizeSlackSocketEnvelope,
  type SlackCoordinatorCommandPort,
} from "../src/index.ts";
import {
  DeterministicClock,
  InMemorySlackIngressStore,
  RecordingSlackAttentionOutbox,
  RecordingSlackSocketAcknowledger,
  StaticSlackAttentionAudienceResolver,
  StaticSlackWorkspaceActorAuthorizer,
  testIds,
} from "@agent-ops/test-kit";
import type { AttentionItem, Command } from "@agent-ops/contracts";

const configuration = {
  appId: "AEXAMPLEAPP",
  appTokenRef: "secret://agentops/slack/app-token",
  botTokenRef: "secret://agentops/slack/bot-token",
  socketMode: true as const,
  publicHttpIngress: false as const,
};

const slashEnvelope = (overrides: Record<string, unknown> = {}) => sanitizeSlackSocketEnvelope({
  envelope_id: "envelope-001",
  type: "slash_commands",
  accepts_response_payload: true,
  payload: {
    // Socket Mode can include these wire fields. Sanitization drops them before
    // deterministic ingress persistence or Coordinator handling.
    token: "legacy-verification-token-never-retained",
    response_url: "https://example.invalid/ephemeral-response",
    team_id: "TEXAMPLE",
    user_id: "UEXAMPLE",
    command: "/agentops",
    text: `answer ${testIds.attention} approve the bounded fixture`,
    ...overrides,
  },
});

class RecordingCoordinatorCommandPort implements SlackCoordinatorCommandPort {
  readonly calls: string[];
  readonly commands: { command: Command; response?: Readonly<Record<string, unknown>> }[] = [];
  throwOnHandle = false;

  constructor(calls: string[]) {
    this.calls = calls;
  }

  async handle(input: { readonly command: Command; readonly response?: Readonly<Record<string, unknown>> }) {
    this.calls.push("coordinator-durable-command");
    if (this.throwOnHandle) throw new Error("durable coordinator unavailable");
    this.commands.push({ ...input });
    return {
      durability: "durably-recorded" as const,
      outcome: input.command.kind === "AnswerAttentionItem"
        ? "attention-response-recorded" as const
        : "command-recorded" as const,
    };
  }
}

const fixture = () => {
  const calls: string[] = [];
  const ingress = new InMemorySlackIngressStore();
  const authorizer = new StaticSlackWorkspaceActorAuthorizer();
  const acknowledger = new RecordingSlackSocketAcknowledger();
  const audience = new StaticSlackAttentionAudienceResolver();
  const outbox = new RecordingSlackAttentionOutbox();
  const coordinator = new RecordingCoordinatorCommandPort(calls);
  const adapter = new SlackSocketModeAttentionAdapter({
    configuration,
    clock: new DeterministicClock(),
    ingressStore: {
      async reserve(receipt) {
        calls.push("ingress-reserve");
        return ingress.reserve(receipt);
      },
      async complete(input) {
        calls.push(`ingress-complete:${input.outcome}`);
        return ingress.complete(input);
      },
    },
    actorAuthorizer: {
      async authorize(input) {
        calls.push("workspace-actor-authorize");
        return authorizer.authorize(input);
      },
    },
    coordinator,
    acknowledger: {
      async acknowledge(input) {
        calls.push("socket-acknowledge");
        return acknowledger.acknowledge(input);
      },
    },
    audienceResolver: audience,
    outbox,
  });
  return {
    adapter,
    authorizer,
    acknowledger,
    audience,
    calls,
    coordinator,
    ingress,
    outbox,
  };
};

const attention = (overrides: Partial<AttentionItem> = {}): AttentionItem => ({
  version: "1.0",
  id: testIds.attention,
  taskId: testIds.task,
  runId: testIds.run,
  securityDomain: "example-domain",
  type: "question",
  summary: "A bounded decision is needed.",
  ...overrides,
});

describe("Slack Socket Mode attention adapter", () => {
  it("uses secret references and refuses HTTP-signing or HTTP-ingress configuration", () => {
    assert.deepEqual(assertSlackSocketModeConfiguration(configuration), configuration);
    assert.throws(
      () => assertSlackSocketModeConfiguration({
        ...configuration,
        appTokenRef: "xapp-refused",
      }),
      /secret:\/\/ references/,
    );
    assert.throws(
      () => assertSlackSocketModeConfiguration({
        ...configuration,
        signingSecretRef: "secret://agentops/slack/http-signing",
      } as typeof configuration),
      /rejects HTTP signing/,
    );
    assert.throws(
      () => assertSlackSocketModeConfiguration({
        ...configuration,
        publicHttpIngress: true,
      } as unknown as typeof configuration),
      /public HTTP ingress is disabled/,
    );
  });

  it("sanitizes raw Socket Mode payloads and persists durable acceptance before its acknowledgement", async () => {
    const { adapter, calls, coordinator, acknowledger, ingress } = fixture();
    const raw = {
      envelope_id: "envelope-001",
      type: "slash_commands",
      accepts_response_payload: true,
      payload: {
        token: "legacy-verification-token-never-retained",
        response_url: "https://example.invalid/ephemeral-response",
        team_id: "TEXAMPLE",
        user_id: "UEXAMPLE",
        command: "/agentops",
        text: `answer ${testIds.attention} approve the bounded fixture`,
      },
    };
    const result = await adapter.handleEnvelope(sanitizeSlackSocketEnvelope(raw));

    assert.equal(result.disposition, "accepted");
    assert.deepEqual(calls, [
      "ingress-reserve",
      "workspace-actor-authorize",
      "coordinator-durable-command",
      "ingress-complete:accepted",
      "socket-acknowledge",
    ]);
    assert.equal(coordinator.commands[0]?.command.kind, "AnswerAttentionItem");
    assert.equal(coordinator.commands[0]?.command.actor.id, testIds.principal);
    assert.deepEqual(coordinator.commands[0]?.response, { answer: "approve the bounded fixture" });
    assert.deepEqual(acknowledger.acknowledgements, [{ envelopeId: "envelope-001" }]);
    assert.equal(JSON.stringify([...ingress.receipts.values()]).includes("legacy-verification-token"), false);
    assert.equal(JSON.stringify([...ingress.receipts.values()]).includes("response_url"), false);
  });

  it("acknowledges a duplicate envelope but invokes the Coordinator only once", async () => {
    const { adapter, calls, coordinator, acknowledger } = fixture();
    const envelope = slashEnvelope();
    assert.equal((await adapter.handleEnvelope(envelope)).disposition, "accepted");
    assert.equal((await adapter.handleEnvelope(envelope)).disposition, "duplicate");

    assert.equal(coordinator.commands.length, 1);
    assert.deepEqual(acknowledger.acknowledgements, [
      { envelopeId: "envelope-001" },
      { envelopeId: "envelope-001" },
    ]);
    assert.deepEqual(calls, [
      "ingress-reserve",
      "workspace-actor-authorize",
      "coordinator-durable-command",
      "ingress-complete:accepted",
      "socket-acknowledge",
      "ingress-reserve",
      "socket-acknowledge",
    ]);
  });

  it("records and acknowledges an unauthorized or unsupported action without granting Coordinator authority", async () => {
    const { adapter, authorizer, calls, coordinator, acknowledger } = fixture();
    authorizer.authorization = { authorized: false, reason: "unknown-actor" };
    const unauthorized = await adapter.handleEnvelope(slashEnvelope());
    assert.equal(unauthorized.disposition, "rejected");
    assert.equal(coordinator.commands.length, 0);
    assert.deepEqual(calls, [
      "ingress-reserve",
      "workspace-actor-authorize",
      "ingress-complete:rejected",
      "socket-acknowledge",
    ]);
    assert.equal(acknowledger.acknowledgements.length, 1);
  });

  it("leaves ingress pending and withholds the acknowledgement when durable Coordinator handling fails", async () => {
    const { adapter, calls, coordinator, acknowledger, ingress } = fixture();
    coordinator.throwOnHandle = true;
    await assert.rejects(() => adapter.handleEnvelope(slashEnvelope()), /durable coordinator unavailable/);

    assert.deepEqual(calls, [
      "ingress-reserve",
      "workspace-actor-authorize",
      "coordinator-durable-command",
    ]);
    assert.equal(acknowledger.acknowledgements.length, 0);
    assert.equal([...ingress.receipts.values()][0]?.outcome, undefined);
  });

  it("maps an interactive attention action to the same durable response command", async () => {
    const { adapter, coordinator } = fixture();
    const envelope = sanitizeSlackSocketEnvelope({
      envelope_id: "envelope-interactive-001",
      type: "interactive",
      accepts_response_payload: true,
      payload: {
        team: { id: "TEXAMPLE" },
        user: { id: "UEXAMPLE" },
        actions: [{
          action_id: "agentops.answer-attention",
          value: JSON.stringify({ attentionItemId: testIds.attention, answer: "approve the interactive fixture" }),
        }],
      },
    });
    const result = await adapter.handleEnvelope(envelope);
    assert.equal(result.disposition, "accepted");
    assert.deepEqual(coordinator.commands[0]?.response, { answer: "approve the interactive fixture" });
  });

  it("separates a concise summary from an exact worker question and keeps authentication handoff out of chat", async () => {
    const { adapter, audience, outbox } = fixture();
    const delivered = await adapter.deliver(attention({
      verbatimQuestion: "Which reviewed repository should receive the bounded change?",
    }));
    assert.equal(delivered.status, "delivered");
    assert.deepEqual(outbox.messages, [
      {
        kind: "attention-summary",
        attentionId: testIds.attention,
        securityDomain: "example-domain",
        summary: "A bounded decision is needed.",
        recipientRef: "slack-recipient:fixture",
      },
      {
        kind: "exact-worker-question",
        attentionId: testIds.attention,
        securityDomain: "example-domain",
        question: "Which reviewed repository should receive the bounded change?",
        recipientRef: "slack-recipient:fixture",
      },
    ]);
    assert.deepEqual(audience.calls.map((call) => call.purpose), [
      "attention-summary",
      "exact-worker-question",
    ]);

    const authResult = await adapter.deliver(attention({ type: "authentication" }));
    assert.equal(authResult.status, "delivered");
    assert.deepEqual(outbox.messages[2], {
      kind: "attention-summary",
      attentionId: testIds.attention,
      securityDomain: "example-domain",
      summary: "A bounded decision is needed.",
      authenticationHandoff: "out-of-band-authorized-provider-flow",
      recipientRef: "slack-recipient:fixture",
    });
  });

  it("never echoes a durable answer into chat and rejects a secret-like answer before ingress", async () => {
    const { adapter, outbox } = fixture();
    await adapter.deliverResponse({
      attention: attention(),
      response: { answer: "a bounded human response" },
    });
    assert.deepEqual(outbox.messages, [{
      kind: "attention-response-recorded",
      attentionId: testIds.attention,
      securityDomain: "example-domain",
      recipientRef: "slack-recipient:fixture",
    }]);
    assert.throws(
      () => slashEnvelope({ text: `answer ${testIds.attention} xapp-refused` }),
      /Inline secret rejected/,
    );
  });
});
