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

const PROVIDER_ID = "codex-app-server";
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

export type CodexAppServerLaunch = {
  readonly command: "codex";
  readonly arguments: readonly ["app-server", "--listen", "stdio://"];
  readonly workingDirectory: string;
};

/**
 * A deliberately narrow JSON-RPC port. A host-specific implementation may
 * bind this to one local stdio child process, but that binding is not present
 * in this package.
 */
export interface CodexAppServerSession {
  request(method: string, params: Readonly<Record<string, unknown>>): Promise<unknown>;
  notify(method: string, params: Readonly<Record<string, unknown>>): Promise<void>;
}

export type CodexAppServerProtocolInfo = {
  readonly protocolVersion: string;
  readonly executableReference: string;
  readonly localStdioOnly: boolean;
};

export interface CodexAppServerSessionFactory {
  inspectProtocol(): Promise<CodexAppServerProtocolInfo>;
  createSession(input: { readonly launch: CodexAppServerLaunch }): Promise<CodexAppServerSession>;
}

export type CodexAppServerProviderConfiguration = {
  /** A policy-approved model identifier; no implicit model default is permitted. */
  readonly model: string;
};

type SessionStatus = "starting" | "running" | "attention" | "failed" | "cancelled" | "complete";

type SessionRecord = {
  readonly invocationId: string;
  readonly requestedAt: string;
  status: SessionStatus;
  sequence: number;
  port?: CodexAppServerSession;
  threadId?: string;
  turnId?: string;
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

const recordResponse = (value: unknown, method: string): Readonly<Record<string, unknown>> => {
  try {
    assertNoInlineSecrets(value);
  } catch {
    throw new ProtocolPayloadError(`${method} returned secret-bearing protocol data.`);
  }
  if (!isRecord(value)) {
    throw new ProtocolPayloadError(`${method} returned an unsupported protocol shape.`);
  }
  return value;
};

const nestedId = (
  response: Readonly<Record<string, unknown>>,
  outerKey: "thread" | "turn",
  method: string,
): string => {
  const outer = response[outerKey];
  if (!isRecord(outer) || typeof outer.id !== "string" || !/^[A-Za-z0-9._:-]{1,160}$/.test(outer.id)) {
    throw new ProtocolPayloadError(`${method} did not return a safe ${outerKey} identifier.`);
  }
  return outer.id;
};

const textField = (input: ProviderInvocation["input"], field: "prompt" | "message"): string => {
  const entries = Object.entries(input);
  if (entries.length !== 1 || typeof input[field] !== "string" || input[field].length < 1 || input[field].length > 16_000) {
    throw new Error(`Codex App Server ${field} input must be one bounded text field.`);
  }
  return input[field];
};

const expectedOperation = (input: ProviderInvocation, operation: ProviderOperation): ProviderInvocation => {
  const invocation = providerInvocationSchema.parse(input);
  if (invocation.operation !== operation) {
    throw new Error(`CodexAppServerProvider expected ${operation}, received ${invocation.operation}.`);
  }
  return invocation;
};

const supportedThreadState = (
  response: Readonly<Record<string, unknown>>,
  priorStatus: SessionStatus,
): ProviderState => {
  const thread = response.thread;
  if (!isRecord(thread) || !isRecord(thread.status) || typeof thread.status.type !== "string") {
    throw new ProtocolPayloadError("thread/read did not return a safe thread status.");
  }
  switch (thread.status.type) {
    case "active":
      return "running";
    case "idle":
      return priorStatus === "cancelled" ? "cancelled" : "complete";
    case "systemError":
      return "failed";
    case "notLoaded":
      return "attention";
    default:
      throw new ProtocolPayloadError("thread/read returned an unsupported thread status.");
  }
};

const approvedModel = (value: string): string => {
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(value)) {
    throw new Error("Codex App Server model configuration must be a bounded identifier.");
  }
  return value;
};

export class CodexAppServerProvider implements Provider {
  readonly #factory: CodexAppServerSessionFactory;
  readonly #configuration: CodexAppServerProviderConfiguration;
  readonly #sessions = new Map<string, SessionRecord>();

  constructor(factory: CodexAppServerSessionFactory, configuration: CodexAppServerProviderConfiguration) {
    this.#factory = factory;
    this.#configuration = { model: approvedModel(configuration.model) };
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
        support: operation === "pause" || operation === "resume" ? "unsupported" : "supported",
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
      if (!/^approved-local:[a-z0-9-]+$/.test(info.executableReference)) {
        reasons.push("unapproved-local-executable-reference");
      }
      if (!info.localStdioOnly) reasons.push("local-stdio-required");
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
        protocol: "codex-app-server",
        protocolVersion,
        model: this.#configuration.model,
        credentialMaterial: "not-read",
      },
    };
  }

  async start(input: ProviderInvocation): Promise<ProviderObservation> {
    const invocation = expectedOperation(input, "start");
    const prompt = textField(invocation.input, "prompt");
    if (this.#sessions.has(invocation.invocationId)) {
      throw new Error("Codex App Server sessions never restart automatically; create a new authorized invocation.");
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
      const port = await this.#factory.createSession({
        launch: {
          command: "codex",
          arguments: ["app-server", "--listen", "stdio://"],
          workingDirectory: invocation.envelope.safeWorkingDirectory,
        },
      });
      session.port = port;
      recordResponse(await port.request("initialize", {
        clientInfo: { name: "agent-ops", version: PROVIDER_VERSION },
      }), "initialize");
      await port.notify("initialized", {});
      const threadResponse = recordResponse(await port.request("thread/start", {
        cwd: invocation.envelope.safeWorkingDirectory,
        model: this.#configuration.model,
      }), "thread/start");
      session.threadId = nestedId(threadResponse, "thread", "thread/start");
      const turnResponse = recordResponse(await port.request("turn/start", {
        threadId: session.threadId,
        input: [{ type: "text", text: prompt }],
      }), "turn/start");
      session.turnId = nestedId(turnResponse, "turn", "turn/start");
      session.status = "running";
      return this.#observation(invocation, session, "running", {
        execution: "bounded-started",
        protocol: "codex-app-server",
        threadId: session.threadId,
        turnId: session.turnId,
      });
    } catch (error) {
      session.status = "attention";
      if (error instanceof ProtocolPayloadError) throw error;
      return this.#attention(invocation, session, "provider-session-unavailable");
    }
  }

  async sendInput(input: ProviderInvocation): Promise<ProviderObservation> {
    const invocation = expectedOperation(input, "send-input");
    const message = textField(invocation.input, "message");
    const session = this.#sessionFor(invocation);
    if (session.status !== "running" || !session.port || !session.threadId || !session.turnId) {
      return this.#attention(invocation, session, "active-turn-unavailable");
    }
    try {
      recordResponse(await session.port.request("turn/steer", {
        threadId: session.threadId,
        input: [{ type: "text", text: message }],
      }), "turn/steer");
      return this.#observation(invocation, session, "running", {
        execution: "active-turn-steer-requested",
        protocol: "codex-app-server",
        threadId: session.threadId,
        turnId: session.turnId,
      });
    } catch (error) {
      if (error instanceof ProtocolPayloadError) throw error;
      session.status = "attention";
      return this.#attention(invocation, session, "provider-transport-failed");
    }
  }

  async inspect(input: ProviderInvocation): Promise<ProviderObservation> {
    const invocation = expectedOperation(input, "inspect");
    const session = this.#sessionFor(invocation);
    if (!session.port || !session.threadId) return this.#attention(invocation, session, "provider-session-unavailable");
    try {
      const response = recordResponse(await session.port.request("thread/read", {
        threadId: session.threadId,
      }), "thread/read");
      const state = supportedThreadState(response, session.status);
      session.status = state === "complete"
        ? "complete"
        : state === "cancelled"
          ? "cancelled"
          : state === "failed"
            ? "failed"
            : state === "attention"
              ? "attention"
              : "running";
      return this.#observation(invocation, session, state, {
        execution: "inspection-complete",
        protocol: "codex-app-server",
        threadId: session.threadId,
        turnId: session.turnId ?? "not-started",
      });
    } catch (error) {
      if (error instanceof ProtocolPayloadError) throw error;
      session.status = "attention";
      return this.#attention(invocation, session, "provider-transport-failed");
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
    if (!session.port || !session.threadId || !session.turnId || session.status !== "running") {
      return this.#attention(invocation, session, "active-turn-unavailable");
    }
    try {
      recordResponse(await session.port.request("turn/interrupt", {
        threadId: session.threadId,
        turnId: session.turnId,
      }), "turn/interrupt");
      session.status = "cancelled";
      session.interruptionRequested = true;
      return this.#observation(invocation, session, "cancelled", {
        execution: "interruption-requested",
        protocol: "codex-app-server",
        threadId: session.threadId,
        turnId: session.turnId,
        automaticRestart: "disabled",
      });
    } catch (error) {
      if (error instanceof ProtocolPayloadError) throw error;
      session.status = "attention";
      return this.#attention(invocation, session, "provider-transport-failed");
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
        protocol: "codex-app-server",
        threadId: session.threadId ?? "unavailable",
        turnId: session.turnId ?? "unavailable",
        terminalState: session.status,
        interruptionRequested: session.interruptionRequested,
        automaticRestart: "disabled",
        transcript: "excluded",
        authenticationState: "excluded",
      },
    }];
  }

  #sessionFor(invocation: ProviderInvocation): SessionRecord {
    const session = this.#sessions.get(invocation.invocationId);
    if (!session) throw new Error("No Codex App Server session exists for this authorized invocation.");
    return session;
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
    reason: "provider-session-unavailable" | "active-turn-unavailable" | "provider-transport-failed",
  ): ProviderObservation {
    return this.#observation(invocation, session, "attention", {
      reason,
      protocol: "codex-app-server",
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
      protocol: "codex-app-server",
      processControl: "not-performed",
    });
  }
}
