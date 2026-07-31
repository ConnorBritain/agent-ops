import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runProviderConformance } from "@agent-ops/provider-sdk";
import {
  ScriptedJsonRpcTransport,
  buildProviderInvocation,
} from "@agent-ops/test-kit";
import {
  CodexAppServerProvider,
  type CodexAppServerProtocolInfo,
  type CodexAppServerSession,
  type CodexAppServerSessionFactory,
} from "../src/index.ts";

class ScriptedSessionFactory implements CodexAppServerSessionFactory {
  readonly launches: { readonly command: string; readonly arguments: readonly string[]; readonly workingDirectory: string }[] = [];
  readonly protocol: CodexAppServerProtocolInfo;
  readonly port: CodexAppServerSession;

  constructor(port: CodexAppServerSession, protocol: CodexAppServerProtocolInfo = {
    protocolVersion: "0.1.0",
    executableReference: "approved-local:codex-app-server",
    localStdioOnly: true,
  }) {
    this.port = port;
    this.protocol = protocol;
  }

  async inspectProtocol(): Promise<CodexAppServerProtocolInfo> {
    return this.protocol;
  }

  async createSession(input: { readonly launch: { readonly command: "codex"; readonly arguments: readonly ["app-server", "--listen", "stdio://"]; readonly workingDirectory: string } }): Promise<CodexAppServerSession> {
    this.launches.push(input.launch);
    return this.port;
  }
}

const conformanceInputs = {
  start: { prompt: "Complete only the bounded fixture." },
  "send-input": { message: "The fixture is authorized to continue." },
} as const;

const providerConfiguration = { model: "gpt-5.4" } as const;

describe("CodexAppServerProvider", () => {
  it("conforms through local-stdio protocol ordering without a binary, credentials, or a process", async () => {
    const transport = new ScriptedJsonRpcTransport([
      { method: "initialize", params: { clientInfo: { name: "agent-ops", version: "0.1.0" } }, result: { serverInfo: { name: "codex" } } },
      { type: "notification", method: "initialized", params: {} },
      { method: "thread/start", params: { cwd: "/workspace/example", model: "gpt-5.4" }, result: { thread: { id: "thread-1" } } },
      { method: "turn/start", params: { threadId: "thread-1", input: [{ type: "text", text: conformanceInputs.start.prompt }] }, result: { turn: { id: "turn-1" } } },
      { method: "turn/steer", params: { threadId: "thread-1", input: [{ type: "text", text: conformanceInputs["send-input"].message }] }, result: { turn: { id: "turn-1" } } },
      { method: "thread/read", params: { threadId: "thread-1" }, result: { thread: { status: { type: "active", activeFlags: [] } } } },
      { method: "turn/interrupt", params: { threadId: "thread-1", turnId: "turn-1" }, result: {} },
    ]);
    const factory = new ScriptedSessionFactory(transport);
    const provider = new CodexAppServerProvider(factory, providerConfiguration);
    const result = await runProviderConformance(provider, {
      invocation: buildProviderInvocation(),
      operationInputs: conformanceInputs,
      ingestedAt: "2026-07-30T04:00:02Z",
    });

    assert.equal(result.manifest.executionMode, "bounded-execution");
    assert.deepEqual(result.manifest.lifecycle.filter((entry) => entry.support === "unsupported").map((entry) => entry.operation), ["pause", "resume"]);
    assert.equal(result.observations.length, 6);
    assert.equal(result.artifacts.length, 1);
    assert.match(JSON.stringify(result.artifacts), /"terminalState":"cancelled"/);
    assert.match(JSON.stringify(result.artifacts), /"automaticRestart":"disabled"/);
    assert.doesNotMatch(JSON.stringify(result.artifacts), /Complete only the bounded fixture|authorized to continue/);
    assert.deepEqual(factory.launches, [{
      command: "codex",
      arguments: ["app-server", "--listen", "stdio://"],
      workingDirectory: "/workspace/example",
    }]);
    assert.deepEqual(transport.requests.map((request) => request.method), [
      "initialize", "thread/start", "turn/start", "turn/steer", "thread/read", "turn/interrupt",
    ]);
    assert.deepEqual(transport.notifications, [{ method: "initialized", params: {} }]);
    transport.assertComplete();
  });

  it("preserves redacted evidence and never auto-restarts after a transport failure", async () => {
    const transport = new ScriptedJsonRpcTransport([
      { method: "initialize", params: { clientInfo: { name: "agent-ops", version: "0.1.0" } }, result: {} },
      { type: "notification", method: "initialized", params: {} },
      { method: "thread/start", params: { cwd: "/workspace/example", model: "gpt-5.4" }, result: { thread: { id: "thread-crash" } } },
      { method: "turn/start", params: { threadId: "thread-crash", input: [{ type: "text", text: "secret-safe starting prompt" }] }, result: { turn: { id: "turn-crash" } } },
      { method: "thread/read", params: { threadId: "thread-crash" }, errorMessage: "connection closed" },
    ]);
    const factory = new ScriptedSessionFactory(transport);
    const provider = new CodexAppServerProvider(factory, providerConfiguration);
    const start = buildProviderInvocation({ input: { prompt: "secret-safe starting prompt" } });
    await provider.start(start);
    const inspection = await provider.inspect({ ...start, operation: "inspect", input: {} });
    const artifacts = await provider.collectArtifacts({ ...start, operation: "collect-artifacts", input: {} });

    assert.equal(inspection.state, "attention");
    assert.deepEqual(inspection.detail, {
      reason: "provider-transport-failed",
      protocol: "codex-app-server",
      automaticRestart: "disabled",
      evidencePreservation: "session-metadata-only",
    });
    assert.match(JSON.stringify(artifacts), /"automaticRestart":"disabled"/);
    assert.doesNotMatch(JSON.stringify(artifacts), /secret-safe starting prompt|connection closed/);
    await assert.rejects(provider.start(start), /never restart automatically/);
    assert.equal(factory.launches.length, 1);
    transport.assertComplete();
  });

  it("maps documented structured thread status without storing the provider transcript", async () => {
    const transport = new ScriptedJsonRpcTransport([
      { method: "initialize", params: { clientInfo: { name: "agent-ops", version: "0.1.0" } }, result: {} },
      { type: "notification", method: "initialized", params: {} },
      { method: "thread/start", params: { cwd: "/workspace/example", model: "gpt-5.4" }, result: { thread: { id: "thread-status" } } },
      { method: "turn/start", params: { threadId: "thread-status", input: [{ type: "text", text: "bounded prompt" }] }, result: { turn: { id: "turn-status" } } },
      { method: "turn/interrupt", params: { threadId: "thread-status", turnId: "turn-status" }, result: {} },
      { method: "thread/read", params: { threadId: "thread-status" }, result: { thread: { status: { type: "idle" } } } },
    ]);
    const provider = new CodexAppServerProvider(new ScriptedSessionFactory(transport), providerConfiguration);
    const start = buildProviderInvocation({ input: { prompt: "bounded prompt" } });
    await provider.start(start);
    await provider.cancel({ ...start, operation: "cancel", input: {} });
    const inspection = await provider.inspect({ ...start, operation: "inspect", input: {} });

    assert.equal(inspection.state, "cancelled");
    assert.doesNotMatch(JSON.stringify(inspection), /bounded prompt/);
    transport.assertComplete();
  });

  it("rejects secret-bearing and unknown protocol payloads without recording them", async () => {
    const transport = new ScriptedJsonRpcTransport([
      { method: "initialize", params: { clientInfo: { name: "agent-ops", version: "0.1.0" } }, result: {} },
      { type: "notification", method: "initialized", params: {} },
      { method: "thread/start", params: { cwd: "/workspace/example", model: "gpt-5.4" }, result: { thread: { id: "thread-safe" }, token: "should-never-be-accepted" } },
    ]);
    const provider = new CodexAppServerProvider(new ScriptedSessionFactory(transport), providerConfiguration);
    await assert.rejects(
      provider.start(buildProviderInvocation({ input: { prompt: "bounded prompt" } })),
      /secret-bearing protocol data/,
    );
    transport.assertComplete();

    const malformedTransport = new ScriptedJsonRpcTransport([
      { method: "initialize", params: { clientInfo: { name: "agent-ops", version: "0.1.0" } }, result: {} },
      { type: "notification", method: "initialized", params: {} },
      { method: "thread/start", params: { cwd: "/workspace/example", model: "gpt-5.4" }, result: { thread: { id: "../../not-a-thread-id" } } },
    ]);
    const malformedProvider = new CodexAppServerProvider(new ScriptedSessionFactory(malformedTransport), providerConfiguration);
    await assert.rejects(
      malformedProvider.start(buildProviderInvocation({ input: { prompt: "bounded prompt" } })),
      /safe thread identifier/,
    );
    malformedTransport.assertComplete();
  });

  it("rejects a local environment that is not an approved stdio-only protocol binding", async () => {
    const factory = new ScriptedSessionFactory(new ScriptedJsonRpcTransport([]), {
      protocolVersion: "not-a-version",
      executableReference: "unapproved:somewhere-else",
      localStdioOnly: false,
    });
    const provider = new CodexAppServerProvider(factory, providerConfiguration);
    const verdict = await provider.validateEnvironment(buildProviderInvocation({ operation: "validate-environment" }));

    assert.equal(verdict.accepted, false);
    assert.deepEqual(verdict.reasons, [
      "unsupported-protocol-version",
      "unapproved-local-executable-reference",
      "local-stdio-required",
    ]);
  });
});
