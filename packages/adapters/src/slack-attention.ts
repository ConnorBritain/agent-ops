import {
  CONTRACT_VERSION,
  assertNoInlineSecrets,
  commandSchema,
  secretRefSchema,
  type AttentionItem,
  type Command,
} from "@agent-ops/contracts";
import type {
  AttentionDeliveryAttempt,
  AttentionProjectionPort,
} from "@agent-ops/domain";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const requireRecord = (value: unknown, label: string): UnknownRecord => {
  if (!isRecord(value)) throw new Error(`Slack ${label} must be an object.`);
  return value;
};

const requireText = (value: unknown, label: string, options: {
  readonly min?: number;
  readonly max?: number;
} = {}): string => {
  const min = options.min ?? 1;
  const max = options.max ?? 2_000;
  if (
    typeof value !== "string"
    || value.length < min
    || value.length > max
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`Slack ${label} is invalid.`);
  }
  return value;
};

const requireUuid = (value: unknown, label: string): string => {
  const id = requireText(value, label, { max: 64 });
  const parsed = commandSchema.shape.target.shape.id.safeParse(id);
  if (!parsed.success) throw new Error(`Slack ${label} must be a UUID.`);
  return parsed.data;
};

/**
 * Socket Mode is selected intentionally. It uses a pre-authenticated WebSocket
 * connection, so this configuration refuses HTTP ingress and HTTP signing
 * secrets. The app and bot token values are never accepted here: only stable
 * secret-store references may appear in a composition configuration.
 */
export type SlackSocketModeConfiguration = {
  readonly appId: string;
  readonly appTokenRef: string;
  readonly botTokenRef: string;
  readonly socketMode: true;
  readonly publicHttpIngress: false;
};

const socketModeConfigurationKeys = new Set([
  "appId",
  "appTokenRef",
  "botTokenRef",
  "socketMode",
  "publicHttpIngress",
]);

export function assertSlackSocketModeConfiguration(
  configuration: SlackSocketModeConfiguration,
): SlackSocketModeConfiguration {
  const raw = requireRecord(configuration, "Socket Mode configuration");
  for (const key of Object.keys(raw)) {
    if (!socketModeConfigurationKeys.has(key)) {
      throw new Error(
        "Slack Socket Mode rejects HTTP signing or unrecognized configuration.",
      );
    }
  }
  if (raw.socketMode !== true || raw.publicHttpIngress !== false) {
    throw new Error("Slack attention uses Socket Mode only; public HTTP ingress is disabled.");
  }
  const appId = requireText(raw.appId, "app ID", { max: 128 });
  const appTokenRef = secretRefSchema.safeParse(raw.appTokenRef);
  const botTokenRef = secretRefSchema.safeParse(raw.botTokenRef);
  if (!appTokenRef.success || !botTokenRef.success) {
    throw new Error("Slack tokens must be approved secret:// references.");
  }
  const safe = {
    appId,
    appTokenRef: appTokenRef.data,
    botTokenRef: botTokenRef.data,
    socketMode: true as const,
    publicHttpIngress: false as const,
  };
  assertNoInlineSecrets(safe);
  return safe;
}

export type SlackSlashCommandPayload = {
  readonly kind: "slash-command";
  readonly workspaceId: string;
  readonly actorExternalId: string;
  readonly command: string;
  readonly text: string;
};

export type SlackAttentionActionPayload = {
  readonly kind: "attention-action";
  readonly workspaceId: string;
  readonly actorExternalId: string;
  readonly attentionItemId: string;
  readonly answer: string;
};

/**
 * A secret-safe, minimal representation of a Socket Mode envelope. The raw
 * Slack wire payload can include deprecated verification tokens and response
 * URLs; `sanitizeSlackSocketEnvelope` intentionally drops them before any
 * durable port or projection can see the event.
 */
export type SlackSocketEnvelope = {
  readonly envelopeId: string;
  readonly type: "slash_commands" | "interactive";
  readonly acceptsResponsePayload: boolean;
  readonly payload: SlackSlashCommandPayload | SlackAttentionActionPayload;
};

const parseAttentionActionValue = (value: unknown): {
  readonly attentionItemId: string;
  readonly answer: string;
} => {
  const raw = requireText(value, "interactive action value", { max: 4_000 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Slack interactive action value must be JSON.");
  }
  const action = requireRecord(parsed, "interactive action");
  return {
    attentionItemId: requireUuid(action.attentionItemId, "attention item ID"),
    answer: requireText(action.answer, "interactive answer", { max: 2_000 }),
  };
};

/**
 * Extract only the fields AgentOps needs from an untrusted Socket Mode message.
 * Deliberately omitted Slack fields include `token`, `response_url`, user
 * display names, channel information, and trigger identifiers. Socket Mode's
 * connection is authenticated by Slack; AgentOps separately authorizes the
 * workspace and actor below.
 */
export function sanitizeSlackSocketEnvelope(raw: unknown): SlackSocketEnvelope {
  const envelope = requireRecord(raw, "Socket Mode envelope");
  const envelopeId = requireText(envelope.envelope_id, "envelope ID", { max: 200 });
  const type = requireText(envelope.type, "envelope type", { max: 64 });
  const acceptsResponsePayload = envelope.accepts_response_payload === true;
  const payload = requireRecord(envelope.payload, "Socket Mode payload");

  if (type === "slash_commands") {
    const safe: SlackSocketEnvelope = {
      envelopeId,
      type,
      acceptsResponsePayload,
      payload: {
        kind: "slash-command",
        workspaceId: requireText(payload.team_id, "workspace ID", { max: 128 }),
        actorExternalId: requireText(payload.user_id, "actor ID", { max: 128 }),
        command: requireText(payload.command, "slash command", { max: 128 }),
        text: requireText(payload.text, "slash command text", { min: 0, max: 2_000 }),
      },
    };
    assertNoInlineSecrets(safe);
    return safe;
  }

  if (type === "interactive") {
    const team = requireRecord(payload.team, "interactive team");
    const user = requireRecord(payload.user, "interactive user");
    const actions = payload.actions;
    if (!Array.isArray(actions) || actions.length !== 1) {
      throw new Error("Slack interactive payload must contain exactly one action.");
    }
    const action = requireRecord(actions[0], "interactive action");
    if (action.action_id !== "agentops.answer-attention") {
      throw new Error("Slack interactive action is not an AgentOps attention response.");
    }
    const parsedAction = parseAttentionActionValue(action.value);
    const safe: SlackSocketEnvelope = {
      envelopeId,
      type,
      acceptsResponsePayload,
      payload: {
        kind: "attention-action",
        workspaceId: requireText(team.id, "workspace ID", { max: 128 }),
        actorExternalId: requireText(user.id, "actor ID", { max: 128 }),
        ...parsedAction,
      },
    };
    assertNoInlineSecrets(safe);
    return safe;
  }

  throw new Error("Slack Socket Mode envelope type is not supported by AgentOps.");
}

export type SlackAuthorizedActor = {
  readonly authorized: true;
  readonly principalId: string;
  readonly securityDomain: string;
};

export type SlackActorAuthorization = SlackAuthorizedActor | {
  readonly authorized: false;
  readonly reason: "unknown-workspace" | "unknown-actor" | "domain-not-authorized";
};

/** The resolver maps an authenticated Slack actor to an AgentOps human principal. */
export interface SlackWorkspaceActorAuthorizer {
  authorize(input: {
    readonly workspaceId: string;
    readonly actorExternalId: string;
  }): Promise<SlackActorAuthorization>;
}

export type SlackIngressReceipt = {
  readonly receiptId: string;
  readonly envelopeId: string;
  readonly workspaceId: string;
  readonly actorExternalId: string;
  readonly receivedAt: string;
};

export type SlackIngressReservation =
  | { readonly state: "pending" }
  | { readonly state: "completed"; readonly outcome: "accepted" | "rejected" };

/**
 * This is a durable ingress-deduplication port. An implementation retains a
 * pending receipt across a transport failure, so a Slack retry can safely use
 * the same idempotency key rather than causing a second Coordinator command.
 */
export interface SlackIngressStore {
  reserve(receipt: SlackIngressReceipt): Promise<SlackIngressReservation>;
  complete(input: {
    readonly receiptId: string;
    readonly outcome: "accepted" | "rejected";
    readonly completedAt: string;
  }): Promise<void>;
}

/**
 * Coordinator-owned command handling remains the authority boundary. A Slack
 * adapter can ask this port to handle a command only after ingress persistence;
 * it cannot write task/run state itself.
 */
export interface SlackCoordinatorCommandPort {
  handle(input: {
    readonly command: Command;
    readonly response?: Readonly<Record<string, unknown>>;
  }): Promise<{
    readonly durability: "durably-recorded";
    readonly outcome: "command-recorded" | "attention-response-recorded";
  }>;
}

/** The real Socket client is a separately authorized composition concern. */
export interface SlackSocketAcknowledger {
  acknowledge(input: { readonly envelopeId: string }): Promise<void>;
}

export interface SlackClock {
  now(): string;
}

export type SlackAttentionAudiencePurpose =
  | "attention-summary"
  | "exact-worker-question"
  | "response-recorded";

export interface SlackAttentionAudienceResolver {
  resolve(input: {
    readonly securityDomain: string;
    readonly purpose: SlackAttentionAudiencePurpose;
  }): Promise<{ readonly recipientRef: string } | undefined>;
}

export type SlackAttentionMessage =
  | {
    readonly kind: "attention-summary";
    readonly recipientRef: string;
    readonly attentionId: string;
    readonly securityDomain: string;
    readonly summary: string;
    readonly authenticationHandoff?: "out-of-band-authorized-provider-flow";
  }
  | {
    readonly kind: "exact-worker-question";
    readonly recipientRef: string;
    readonly attentionId: string;
    readonly securityDomain: string;
    readonly question: string;
  }
  | {
    readonly kind: "attention-response-recorded";
    readonly recipientRef: string;
    readonly attentionId: string;
    readonly securityDomain: string;
  };

type SlackUnaddressedAttentionMessage =
  | {
    readonly kind: "attention-summary";
    readonly attentionId: string;
    readonly securityDomain: string;
    readonly summary: string;
    readonly authenticationHandoff?: "out-of-band-authorized-provider-flow";
  }
  | {
    readonly kind: "exact-worker-question";
    readonly attentionId: string;
    readonly securityDomain: string;
    readonly question: string;
  }
  | {
    readonly kind: "attention-response-recorded";
    readonly attentionId: string;
    readonly securityDomain: string;
  };

/**
 * An outbox-backed delivery port is injected by a future composition root. The
 * public adapter has no HTTP, WebSocket, timer, environment-variable, or Slack
 * SDK dependency.
 */
export interface SlackAttentionOutbox {
  send(message: SlackAttentionMessage): Promise<AttentionDeliveryAttempt>;
}

export type SlackAttentionAdapterPorts = {
  readonly configuration: SlackSocketModeConfiguration;
  readonly clock: SlackClock;
  readonly ingressStore: SlackIngressStore;
  readonly actorAuthorizer: SlackWorkspaceActorAuthorizer;
  readonly coordinator: SlackCoordinatorCommandPort;
  readonly acknowledger: SlackSocketAcknowledger;
  readonly audienceResolver: SlackAttentionAudienceResolver;
  readonly outbox: SlackAttentionOutbox;
};

export type SlackIngressResult = {
  readonly disposition: "accepted" | "rejected" | "duplicate";
  readonly command?: Command;
};

type ParsedIngressCommand = {
  readonly command: Command;
  readonly response?: Readonly<Record<string, unknown>>;
};

const commandForEnvelope = (input: {
  readonly envelope: SlackSocketEnvelope;
  readonly principal: SlackAuthorizedActor;
}): ParsedIngressCommand => {
  const base = {
    version: CONTRACT_VERSION,
    idempotencyKey: `slack:${input.envelope.payload.workspaceId}:${input.envelope.envelopeId}`,
    actor: {
      id: input.principal.principalId,
      kind: "human" as const,
      securityDomain: input.principal.securityDomain,
    },
    source: {
      kind: "chat" as const,
      sourceId: `slack:${input.envelope.payload.workspaceId}:${input.envelope.envelopeId}`,
    },
    requiredCapabilities: [],
  };

  if (input.envelope.payload.kind === "attention-action") {
    const command = commandSchema.parse({
      ...base,
      kind: "AnswerAttentionItem",
      target: { kind: "attention-item", id: input.envelope.payload.attentionItemId },
    });
    return { command, response: { answer: input.envelope.payload.answer } };
  }

  if (input.envelope.payload.command !== "/agentops") {
    throw new Error("Slack command is not the AgentOps command.");
  }
  const answer = /^answer\s+([^\s]+)\s+([\s\S]+)$/i.exec(input.envelope.payload.text);
  if (answer?.[1] && answer[2]) {
    const command = commandSchema.parse({
      ...base,
      kind: "AnswerAttentionItem",
      target: { kind: "attention-item", id: requireUuid(answer[1], "attention item ID") },
    });
    return { command, response: { answer: requireText(answer[2], "attention answer", { max: 2_000 }) } };
  }
  const inspect = /^inspect\s+([^\s]+)$/i.exec(input.envelope.payload.text);
  if (inspect?.[1]) {
    return {
      command: commandSchema.parse({
        ...base,
        kind: "InspectRun",
        target: { kind: "run", id: requireUuid(inspect[1], "run ID") },
      }),
    };
  }
  if (/^authenticate\b/i.test(input.envelope.payload.text)) {
    throw new Error("Authentication handoff must remain in the authorized provider flow.");
  }
  throw new Error("Slack command is not a supported AgentOps action.");
};

const receiptFor = (envelope: SlackSocketEnvelope, now: string): SlackIngressReceipt => ({
  receiptId: `slack:${envelope.payload.workspaceId}:${envelope.envelopeId}`,
  envelopeId: envelope.envelopeId,
  workspaceId: envelope.payload.workspaceId,
  actorExternalId: envelope.payload.actorExternalId,
  receivedAt: now,
});

/**
 * A deterministic Socket Mode adapter. It accepts already-sanitized envelopes;
 * a separately authorized composition root may obtain raw envelopes and call
 * `sanitizeSlackSocketEnvelope` first. No inbound network listener is created
 * here.
 */
export class SlackSocketModeAttentionAdapter implements AttentionProjectionPort {
  readonly #ports: SlackAttentionAdapterPorts;

  constructor(ports: SlackAttentionAdapterPorts) {
    assertSlackSocketModeConfiguration(ports.configuration);
    this.#ports = ports;
  }

  async handleEnvelope(envelope: SlackSocketEnvelope): Promise<SlackIngressResult> {
    assertNoInlineSecrets(envelope);
    const receipt = receiptFor(envelope, this.#ports.clock.now());
    const reservation = await this.#ports.ingressStore.reserve(receipt);
    if (reservation.state === "completed") {
      await this.#ports.acknowledger.acknowledge({ envelopeId: envelope.envelopeId });
      return { disposition: "duplicate" };
    }

    const authorization = await this.#ports.actorAuthorizer.authorize({
      workspaceId: envelope.payload.workspaceId,
      actorExternalId: envelope.payload.actorExternalId,
    });
    if (!authorization.authorized) {
      await this.#ports.ingressStore.complete({
        receiptId: receipt.receiptId,
        outcome: "rejected",
        completedAt: this.#ports.clock.now(),
      });
      await this.#ports.acknowledger.acknowledge({ envelopeId: envelope.envelopeId });
      return { disposition: "rejected" };
    }

    let parsed: ParsedIngressCommand;
    try {
      parsed = commandForEnvelope({ envelope, principal: authorization });
      assertNoInlineSecrets(parsed);
    } catch {
      await this.#ports.ingressStore.complete({
        receiptId: receipt.receiptId,
        outcome: "rejected",
        completedAt: this.#ports.clock.now(),
      });
      await this.#ports.acknowledger.acknowledge({ envelopeId: envelope.envelopeId });
      return { disposition: "rejected" };
    }

    // This port must return durable confirmation. If it throws, the receipt
    // stays pending and no Socket acknowledgement is sent, allowing Slack's
    // retry to reuse the same idempotency key.
    const handled = await this.#ports.coordinator.handle(parsed);
    if (handled.durability !== "durably-recorded") {
      throw new Error("Slack command handling did not provide durable confirmation.");
    }
    await this.#ports.ingressStore.complete({
      receiptId: receipt.receiptId,
      outcome: "accepted",
      completedAt: this.#ports.clock.now(),
    });
    await this.#ports.acknowledger.acknowledge({ envelopeId: envelope.envelopeId });
    return { disposition: "accepted", command: parsed.command };
  }

  async #send(message: SlackUnaddressedAttentionMessage, purpose: SlackAttentionAudiencePurpose): Promise<AttentionDeliveryAttempt> {
    const audience = await this.#ports.audienceResolver.resolve({
      securityDomain: message.securityDomain,
      purpose,
    });
    if (!audience) return { status: "deferred" };
    const projected = { ...message, recipientRef: audience.recipientRef } as SlackAttentionMessage;
    assertNoInlineSecrets(projected);
    try {
      return await this.#ports.outbox.send(projected);
    } catch {
      return { status: "deferred" };
    }
  }

  async deliver(attention: AttentionItem): Promise<AttentionDeliveryAttempt> {
    assertNoInlineSecrets(attention);
    const summary = await this.#send({
      kind: "attention-summary",
      attentionId: attention.id,
      securityDomain: attention.securityDomain,
      summary: attention.summary,
      ...(attention.type === "authentication"
        ? { authenticationHandoff: "out-of-band-authorized-provider-flow" as const }
        : {}),
    }, "attention-summary");
    if (summary.status !== "delivered" || !attention.verbatimQuestion) return summary;

    const exact = await this.#send({
      kind: "exact-worker-question",
      attentionId: attention.id,
      securityDomain: attention.securityDomain,
      question: attention.verbatimQuestion,
    }, "exact-worker-question");
    if (exact.status !== "delivered") return exact;
    return exact.deliveryReference ? exact : summary;
  }

  async deliverResponse(input: {
    readonly attention: AttentionItem;
    readonly response: Readonly<Record<string, unknown>>;
  }): Promise<AttentionDeliveryAttempt> {
    assertNoInlineSecrets(input);
    // Do not echo the answer back to chat. A future worker-session projection
    // receives the durable response through its own Coordinator-owned port.
    return this.#send({
      kind: "attention-response-recorded",
      attentionId: input.attention.id,
      securityDomain: input.attention.securityDomain,
    }, "response-recorded");
  }
}
