import {
  CONTRACT_VERSION,
  assertNoInlineSecrets,
  providerInvocationSchema,
  type Provider,
  type ProviderArtifact,
  type ProviderCapabilityManifest,
  type ProviderEnvironmentVerdict,
  type ProviderInvocation,
  type ProviderObservation,
  type ProviderOperation,
  type ProviderState,
} from "@agent-ops/contracts";

const PROVIDER_ID = "claude-code";
const PROVIDER_VERSION = "0.1.0";

const lifecycle = [
  "validate-environment",
  "start",
  "send-input",
  "inspect",
  "pause",
  "resume",
  "cancel",
  "collect-artifacts",
] as const;

export type ClaudeCodeLaunch = {
  readonly command: "claude";
  readonly arguments: readonly string[];
  readonly workingDirectory: string;
  /**
   * The future private stdio binding receives the approved prompt through its
   * local port. The public adapter deliberately contains no process launcher.
   */
  readonly initialPrompt: string;
};

/**
 * Narrow local-stdio port for Claude Code print mode. A private composition
 * root may bind it to one local child process only after a separate canary;
 * this public package neither starts a process nor reads credentials.
 */
export interface ClaudeCodeSession {
  nextEvent(): Promise<unknown | undefined>;
  terminate(): Promise<void>;
}

export type ClaudeCodeProtocolInfo = {
  readonly protocolVersion: string;
  readonly executableReference: string;
  readonly localStdioOnly: boolean;
  readonly streamJsonOutput: boolean;
  readonly sessionPersistenceDisabled: boolean;
  readonly permissionMode: "dontAsk";
};

export interface ClaudeCodeSessionFactory {
  inspectProtocol(): Promise<ClaudeCodeProtocolInfo>;
  createSession(input: { readonly launch: ClaudeCodeLaunch }): Promise<ClaudeCodeSession>;
}

export type ClaudeCodeProviderConfiguration = {
  /** A policy-approved model identifier; the adapter never picks a default. */
  readonly model: string;
  /** A policy-supplied bound for this one non-interactive execution. */
  readonly maximumTurns: number;
  /** A policy-supplied USD cap; no spend occurs in this source-only adapter. */
  readonly maximumBudgetUsd: number;
};

type SessionStatus = "starting" | "running" | "attention" | "failed" | "cancelled" | "complete";

type SessionRecord = {
  readonly invocationId: string;
  readonly requestedAt: string;
  status: SessionStatus;
  sequence: number;
  port?: ClaudeCodeSession;
  sessionId?: string;
  model?: string;
  interruptionRequested: boolean;
};

class ProtocolPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolPayloadError";
  }
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const safeRecord = (value: unknown, operation: string): Readonly<Record<string, unknown>> => {
  try {
    assertNoInlineSecrets(value);
  } catch {
    throw new ProtocolPayloadError(`${operation} returned secret-bearing protocol data.`);
  }
  if (!isRecord(value)) {
    throw new ProtocolPayloadError(`${operation} returned an unsupported protocol shape.`);
  }
  return value;
};

const safeIdentifier = (value: unknown, field: string, operation: string): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,160}$/.test(value)) {
    throw new ProtocolPayloadError(`${operation} did not return a safe ${field}.`);
  }
  return value;
};

const textField = (input: ProviderInvocation["input"], field: "prompt"): string => {
  const entries = Object.entries(input);
  if (entries.length !== 1 || typeof input[field] !== "string" || input[field].length < 1 || input[field].length > 16_000) {
    throw new Error(`Claude Code ${field} input must be one bounded text field.`);
  }
  return input[field];
};

const expectedOperation = (input: ProviderInvocation, operation: ProviderOperation): ProviderInvocation => {
  const invocation = providerInvocationSchema.parse(input);
  if (invocation.operation !== operation) {
    throw new Error(`ClaudeCodeProvider expected ${operation}, received ${invocation.operation}.`);
  }
  return invocation;
};

const approvedModel = (value: string): string => {
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(value)) {
    throw new Error("Claude Code model configuration must be a bounded identifier.");
  }
  return value;
};

const boundedTurns = (value: number): number => {
  if (!Number.isInteger(value) || value < 1 || value > 50) {
    throw new Error("Claude Code maximumTurns must be an integer between 1 and 50.");
  }
  return value;
};

const boundedBudget = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0 || value > 10_000) {
    throw new Error("Claude Code maximumBudgetUsd must be a finite amount greater than zero and at most 10000.");
  }
  return value;
};

export class ClaudeCodeProvider implements Provider {
  readonly #factory: ClaudeCodeSessionFactory;
  readonly #configuration: ClaudeCodeProviderConfiguration;
  readonly #sessions = new Map<string, SessionRecord>();

  constructor(factory: ClaudeCodeSessionFactory, configuration: ClaudeCodeProviderConfiguration) {
    this.#factory = factory;
    this.#configuration = {
      model: approvedModel(configuration.model),
      maximumTurns: boundedTurns(configuration.maximumTurns),
      maximumBudgetUsd: boundedBudget(configuration.maximumBudgetUsd),
    };
  }

  async inspectCapabilities(): Promise<ProviderCapabilityManifest> {
    return {
      version: CONTRACT_VERSION,
      providerId: PROVIDER_ID,
      providerVersion: PROVIDER_VERSION,
      executionMode: "bounded-execution",
      capabilities: ["terminal", "git"],
      lifecycle: lifecycle.map((operation) => ({
        operation,
        support: operation === "send-input" || operation === "pause" || operation === "resume"
          ? "unsupported"
          : "supported",
      })),
    };
  }

  async validateEnvironment(input: ProviderInvocation): Promise<ProviderEnvironmentVerdict> {
    const invocation = expectedOperation(input, "validate-environment");
    const manifest = await this.inspectCapabilities();
    const missingCapabilities = invocation.envelope.requiredCapabilities
      .filter((capability) => !manifest.capabilities.includes(capability));
    const reasons = missingCapabilities.map((capability) => `missing-capability:${capability}`);
    let protocolVersion = "unavailable";

    try {
      const info = await this.#factory.inspectProtocol();
      assertNoInlineSecrets(info);
      if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(info.protocolVersion)) {
        reasons.push("unsupported-protocol-version");
      } else {
        protocolVersion = info.protocolVersion;
      }
      if (info.executableReference !== "approved-local:claude-code") {
        reasons.push("unapproved-local-executable-reference");
      }
      if (!info.localStdioOnly) reasons.push("local-stdio-required");
      if (!info.streamJsonOutput) reasons.push("stream-json-output-required");
      if (!info.sessionPersistenceDisabled) reasons.push("session-persistence-must-be-disabled");
      if (info.permissionMode !== "dontAsk") reasons.push("noninteractive-permission-refusal-required");
    } catch {
      reasons.push("protocol-inspection-unavailable");
    }

    return {
      version: CONTRACT_VERSION,
      providerId: PROVIDER_ID,
      invocationId: invocation.invocationId,
      accepted: reasons.length === 0,
      reasons,
      detail: {
        execution: "bounded-execution",
        protocol: "claude-code-print-stream-json",
        protocolVersion,
        model: this.#configuration.model,
        maximumTurns: this.#configuration.maximumTurns,
        maximumBudgetUsd: this.#configuration.maximumBudgetUsd,
        credentialMaterial: "not-read",
      },
    };
  }

  async start(input: ProviderInvocation): Promise<ProviderObservation> {
    const invocation = expectedOperation(input, "start");
    const prompt = textField(invocation.input, "prompt");
    if (this.#sessions.has(invocation.invocationId)) {
      throw new Error("Claude Code sessions never restart automatically; create a new authorized invocation.");
    }
    const session: SessionRecord = {
      invocationId: invocation.invocationId,
      requestedAt: invocation.requestedAt,
      status: "starting",
      sequence: 0,
      interruptionRequested: false,
    };
    this.#sessions.set(invocation.invocationId, session);

    try {
      session.port = await this.#factory.createSession({
        launch: {
          command: "claude",
          arguments: [
            "--bare",
            "--print",
            "--output-format", "stream-json",
            "--no-session-persistence",
            "--permission-mode", "dontAsk",
            "--max-turns", String(this.#configuration.maximumTurns),
            "--max-budget-usd", String(this.#configuration.maximumBudgetUsd),
            "--model", this.#configuration.model,
          ],
          workingDirectory: invocation.envelope.safeWorkingDirectory,
          initialPrompt: prompt,
        },
      });
      const init = safeRecord(await session.port.nextEvent(), "system/init");
      if (init.type !== "system" || init.subtype !== "init") {
        throw new ProtocolPayloadError("Claude Code must emit system/init before provider work is observed.");
      }
      session.sessionId = safeIdentifier(init.session_id, "session_id", "system/init");
      session.model = safeIdentifier(init.model, "model", "system/init");
      session.status = "running";
      return this.#observation(invocation, session, "running", {
        execution: "bounded-started",
        protocol: "claude-code-print-stream-json",
        sessionId: session.sessionId,
        model: session.model,
        automaticRestart: "disabled",
      });
    } catch (error) {
      session.status = "attention";
      if (error instanceof ProtocolPayloadError) throw error;
      return this.#attention(invocation, session, "provider-session-unavailable");
    }
  }

  async sendInput(input: ProviderInvocation): Promise<ProviderObservation> {
    return this.#unsupported(expectedOperation(input, "send-input"));
  }

  async inspect(input: ProviderInvocation): Promise<ProviderObservation> {
    const invocation = expectedOperation(input, "inspect");
    const session = this.#sessionFor(invocation);
    if (!session.port || session.status !== "running") {
      return this.#observation(invocation, session, this.#stateFor(session.status), {
        protocol: "claude-code-print-stream-json",
        inspection: "no-active-session-read",
        automaticRestart: "disabled",
      });
    }
    try {
      const event = safeRecord(await session.port.nextEvent(), "stream-json");
      const state = this.#stateFromEvent(event, session);
      session.status = state === "complete"
        ? "complete"
        : state === "failed"
          ? "failed"
          : state === "attention"
            ? "attention"
            : "running";
      return this.#observation(invocation, session, state, {
        execution: "stream-event-normalized",
        protocol: "claude-code-print-stream-json",
        eventClass: event.type,
        terminal: state === "complete" || state === "failed",
        automaticRestart: "disabled",
        transcript: "excluded",
      });
    } catch (error) {
      session.status = "attention";
      if (error instanceof ProtocolPayloadError) throw error;
      return this.#attention(invocation, session, "provider-stream-unavailable");
    }
  }

  async pause(input: ProviderInvocation): Promise<ProviderObservation> {
    return this.#unsupported(expectedOperation(input, "pause"));
  }

  async resume(input: ProviderInvocation): Promise<ProviderObservation> {
    return this.#unsupported(expectedOperation(input, "resume"));
  }

  async cancel(input: ProviderInvocation): Promise<ProviderObservation> {
    const invocation = expectedOperation(input, "cancel");
    const session = this.#sessionFor(invocation);
    if (!session.port || session.status !== "running") {
      return this.#observation(invocation, session, this.#stateFor(session.status), {
        protocol: "claude-code-print-stream-json",
        cancellation: "no-active-session",
        automaticRestart: "disabled",
      });
    }
    try {
      await session.port.terminate();
      session.status = "cancelled";
      session.interruptionRequested = true;
      return this.#observation(invocation, session, "cancelled", {
        execution: "local-termination-requested",
        protocol: "claude-code-print-stream-json",
        automaticRestart: "disabled",
      });
    } catch {
      session.status = "attention";
      return this.#attention(invocation, session, "provider-termination-unavailable");
    }
  }

  async collectArtifacts(input: ProviderInvocation): Promise<readonly ProviderArtifact[]> {
    const invocation = expectedOperation(input, "collect-artifacts");
    const session = this.#sessionFor(invocation);
    return [{
      version: CONTRACT_VERSION,
      providerId: PROVIDER_ID,
      invocationId: invocation.invocationId,
      kind: "provider-session-evidence",
      mediaType: "application/json",
      data: {
        protocol: "claude-code-print-stream-json",
        sessionId: session.sessionId ?? "unavailable",
        model: session.model ?? "unavailable",
        terminalState: session.status,
        interruptionRequested: session.interruptionRequested,
        automaticRestart: "disabled",
        transcript: "excluded",
        authenticationState: "excluded",
        costAndUsage: "excluded",
      },
    }];
  }

  #sessionFor(invocation: ProviderInvocation): SessionRecord {
    const session = this.#sessions.get(invocation.invocationId);
    if (!session) throw new Error("No Claude Code session exists for this authorized invocation.");
    return session;
  }

  #stateFromEvent(event: Readonly<Record<string, unknown>>, session: SessionRecord): ProviderState {
    if (typeof event.type !== "string") {
      throw new ProtocolPayloadError("stream-json did not return a safe event type.");
    }
    if (event.type === "result") {
      return event.is_error === true || event.subtype === "error" ? "failed" : "complete";
    }
    if (event.type === "error") return "attention";
    if (event.type === "system" && event.subtype === "api_retry") return "running";
    if (event.type === "system" && event.subtype === "init") {
      session.sessionId = safeIdentifier(event.session_id, "session_id", "system/init");
      session.model = safeIdentifier(event.model, "model", "system/init");
      return "running";
    }
    if (event.type === "assistant" || event.type === "user" || event.type === "stream_event") {
      return "running";
    }
    throw new ProtocolPayloadError("stream-json returned an unsupported event type.");
  }

  #stateFor(status: SessionStatus): ProviderState {
    return status === "complete" || status === "failed" || status === "cancelled" || status === "attention"
      ? status
      : "attention";
  }

  #observation(
    invocation: ProviderInvocation,
    session: SessionRecord,
    state: ProviderState,
    detail: Readonly<Record<string, unknown>>,
  ): ProviderObservation {
    session.sequence += 1;
    return {
      version: CONTRACT_VERSION,
      providerId: PROVIDER_ID,
      invocationId: invocation.invocationId,
      operation: invocation.operation,
      observedAt: invocation.requestedAt,
      state,
      sourceEventId: `${PROVIDER_ID}:${invocation.invocationId}:${invocation.operation}:${session.sequence}`,
      detail,
    };
  }

  #attention(
    invocation: ProviderInvocation,
    session: SessionRecord,
    reason: "provider-session-unavailable" | "provider-stream-unavailable" | "provider-termination-unavailable",
  ): ProviderObservation {
    return this.#observation(invocation, session, "attention", {
      reason,
      protocol: "claude-code-print-stream-json",
      automaticRestart: "disabled",
      evidencePreservation: "session-metadata-only",
    });
  }

  #unsupported(invocation: ProviderInvocation): ProviderObservation {
    const session = this.#sessions.get(invocation.invocationId) ?? {
      invocationId: invocation.invocationId,
      requestedAt: invocation.requestedAt,
      status: "starting" as const,
      sequence: 0,
      interruptionRequested: false,
    };
    if (!this.#sessions.has(invocation.invocationId)) this.#sessions.set(invocation.invocationId, session);
    return this.#observation(invocation, session, "unknown", {
      support: "unsupported",
      protocol: "claude-code-print-stream-json",
      automaticRestart: "disabled",
      processControl: "not-performed",
    });
  }
}
