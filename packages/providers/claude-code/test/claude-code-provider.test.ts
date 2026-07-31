import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runProviderConformance } from "@agent-ops/provider-sdk";
import { buildProviderInvocation } from "@agent-ops/test-kit";
import {
  ClaudeCodeProvider,
  type ClaudeCodeLaunch,
  type ClaudeCodeProtocolInfo,
  type ClaudeCodeSession,
  type ClaudeCodeSessionFactory,
} from "../src/index.ts";

class ScriptedClaudeCodeSession implements ClaudeCodeSession {
  readonly events: unknown[];
  terminateCalls = 0;

  constructor(events: readonly unknown[]) {
    this.events = [...events];
  }

  async nextEvent(): Promise<unknown | undefined> {
    return this.events.shift();
  }

  async terminate(): Promise<void> {
    this.terminateCalls += 1;
  }

  assertComplete(): void {
    assert.equal(this.events.length, 0, "all scripted stream events should be consumed");
  }
}

class ScriptedSessionFactory implements ClaudeCodeSessionFactory {
  readonly launches: ClaudeCodeLaunch[] = [];
  readonly protocol: ClaudeCodeProtocolInfo;
  readonly port: ClaudeCodeSession;

  constructor(port: ClaudeCodeSession, protocol: ClaudeCodeProtocolInfo = {
    protocolVersion: "2.1.219",
    executableReference: "approved-local:claude-code",
    localStdioOnly: true,
    streamJsonOutput: true,
    sessionPersistenceDisabled: true,
    permissionMode: "dontAsk",
  }) {
    this.port = port;
    this.protocol = protocol;
  }

  async inspectProtocol(): Promise<ClaudeCodeProtocolInfo> {
    return this.protocol;
  }

  async createSession(input: { readonly launch: ClaudeCodeLaunch }): Promise<ClaudeCodeSession> {
    this.launches.push(input.launch);
    return this.port;
  }
}

const providerConfiguration = {
  model: "claude-sonnet-4-6",
  maximumTurns: 8,
  maximumBudgetUsd: 5,
} as const;

describe("ClaudeCodeProvider", () => {
  it("passes shared conformance through an injected, bounded print-mode stream", async () => {
    const session = new ScriptedClaudeCodeSession([
      { type: "system", subtype: "init", session_id: "session-1", model: providerConfiguration.model },
      { type: "assistant", message: { role: "assistant", content: [] } },
    ]);
    const factory = new ScriptedSessionFactory(session);
    const provider = new ClaudeCodeProvider(factory, providerConfiguration);
    const result = await runProviderConformance(provider, {
      invocation: buildProviderInvocation(),
      operationInputs: { start: { prompt: "Complete only the bounded fixture." } },
      ingestedAt: "2026-07-30T05:00:02Z",
    });

    assert.equal(result.manifest.executionMode, "bounded-execution");
    assert.deepEqual(result.manifest.lifecycle.filter((entry) => entry.support === "unsupported").map((entry) => entry.operation), ["send-input", "pause", "resume"]);
    assert.equal(result.observations.length, 6);
    assert.equal(result.artifacts.length, 1);
    assert.match(JSON.stringify(result.artifacts), /"terminalState":"cancelled"/);
    assert.match(JSON.stringify(result.artifacts), /"automaticRestart":"disabled"/);
    assert.doesNotMatch(JSON.stringify(result.artifacts), /Complete only the bounded fixture/);
    assert.deepEqual(factory.launches, [{
      command: "claude",
      arguments: [
        "--bare",
        "--print",
        "--output-format", "stream-json",
        "--no-session-persistence",
        "--permission-mode", "dontAsk",
        "--max-turns", "8",
        "--max-budget-usd", "5",
        "--model", providerConfiguration.model,
      ],
      workingDirectory: "/workspace/example",
      initialPrompt: "Complete only the bounded fixture.",
    }]);
    assert.equal(session.terminateCalls, 1);
    session.assertComplete();
  });

  it("normalizes a terminal result without retaining the response, costs, or transcript", async () => {
    const session = new ScriptedClaudeCodeSession([
      { type: "system", subtype: "init", session_id: "session-result", model: providerConfiguration.model },
      {
        type: "result",
        subtype: "success",
        result: "private response that must never be retained",
        total_cost_usd: 0.42,
        session_id: "session-result",
      },
    ]);
    const provider = new ClaudeCodeProvider(new ScriptedSessionFactory(session), providerConfiguration);
    const start = buildProviderInvocation({ input: { prompt: "bounded prompt" } });
    await provider.start(start);
    const inspection = await provider.inspect({ ...start, operation: "inspect", input: {} });
    const artifacts = await provider.collectArtifacts({ ...start, operation: "collect-artifacts", input: {} });

    assert.equal(inspection.state, "complete");
    assert.doesNotMatch(JSON.stringify(inspection), /private response|0\.42/);
    assert.match(JSON.stringify(artifacts), /"costAndUsage":"excluded"/);
    assert.doesNotMatch(JSON.stringify(artifacts), /private response|0\.42|bounded prompt/);
    session.assertComplete();
  });

  it("refuses secret-bearing stream data and never restarts a failed invocation", async () => {
    const secretSession = new ScriptedClaudeCodeSession([
      { type: "system", subtype: "init", session_id: "session-secret", model: providerConfiguration.model },
      { type: "result", subtype: "success", token: "should-never-be-accepted" },
    ]);
    const secretProvider = new ClaudeCodeProvider(new ScriptedSessionFactory(secretSession), providerConfiguration);
    const secretStart = buildProviderInvocation({ input: { prompt: "bounded prompt" } });
    await secretProvider.start(secretStart);
    await assert.rejects(
      secretProvider.inspect({ ...secretStart, operation: "inspect", input: {} }),
      /secret-bearing protocol data/,
    );
    secretSession.assertComplete();

    const unknownSession = new ScriptedClaudeCodeSession([
      { type: "system", subtype: "init", session_id: "session-unknown", model: providerConfiguration.model },
      { type: "not-a-documented-event" },
    ]);
    const unknownProvider = new ClaudeCodeProvider(new ScriptedSessionFactory(unknownSession), providerConfiguration);
    const unknownStart = buildProviderInvocation({ input: { prompt: "bounded prompt" } });
    await unknownProvider.start(unknownStart);
    await assert.rejects(
      unknownProvider.inspect({ ...unknownStart, operation: "inspect", input: {} }),
      /unsupported event type/,
    );
    unknownSession.assertComplete();

    const unavailable: ClaudeCodeSession = {
      async nextEvent(): Promise<unknown> {
        throw new Error("local stdio unavailable");
      },
      async terminate(): Promise<void> {},
    };
    const provider = new ClaudeCodeProvider(new ScriptedSessionFactory(unavailable), providerConfiguration);
    const start = buildProviderInvocation({ input: { prompt: "bounded prompt" } });
    const observation = await provider.start(start);
    assert.equal(observation.state, "attention");
    await assert.rejects(provider.start(start), /never restart automatically/);
  });

  it("rejects a local environment that is not an approved bounded print-mode binding", async () => {
    const provider = new ClaudeCodeProvider(
      new ScriptedSessionFactory(new ScriptedClaudeCodeSession([]), {
        protocolVersion: "not-a-version",
        executableReference: "unapproved:somewhere-else",
        localStdioOnly: false,
        streamJsonOutput: false,
        sessionPersistenceDisabled: false,
        permissionMode: "default" as never,
      }),
      providerConfiguration,
    );
    const verdict = await provider.validateEnvironment(buildProviderInvocation({ operation: "validate-environment" }));

    assert.equal(verdict.accepted, false);
    assert.deepEqual(verdict.reasons, [
      "unsupported-protocol-version",
      "unapproved-local-executable-reference",
      "local-stdio-required",
      "stream-json-output-required",
      "session-persistence-must-be-disabled",
      "noninteractive-permission-refusal-required",
    ]);
  });
});
