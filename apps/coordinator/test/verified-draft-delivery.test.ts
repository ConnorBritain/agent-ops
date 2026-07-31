import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SlackSocketModeAttentionAdapter,
  VerifiedDraftDeliveryService,
  type SlackCoordinatorCommandPort,
} from "@agent-ops/adapters";
import type { DraftPullRequestIntent, VerificationRecord } from "@agent-ops/contracts";
import type { PolicyDecision } from "@agent-ops/domain";
import {
  CodexAppServerProvider,
  type CodexAppServerSession,
  type CodexAppServerSessionFactory,
} from "@agent-ops/provider-codex-app-server";
import {
  DeterministicClock,
  InMemoryCoordinatorDurableStore,
  InMemoryDraftDeliveryStore,
  InMemorySlackIngressStore,
  RecordingDraftPullRequestGateway,
  RecordingSlackAttentionOutbox,
  RecordingSlackSocketAcknowledger,
  ScriptedJsonRpcTransport,
  StaticDraftDeliveryPolicy,
  StaticIndependentVerifier,
  StaticSlackAttentionAudienceResolver,
  StaticSlackWorkspaceActorAuthorizer,
  buildJobEnvelope,
  buildProviderInvocation,
  testIds,
} from "@agent-ops/test-kit";
import {
  CoordinatorRuntime,
  type CoordinatorPolicyEngine,
  type CoordinatorWorkerDispatch,
} from "../src/index.ts";

const policyDecision = (decision: PolicyDecision["decision"]): PolicyDecision => ({
  id: testIds.policy,
  decision,
  securityDomain: "example-domain",
  rationale: "deterministic fixture gate",
});

const dispatchCommand = (idempotencyKey: string) => ({
  version: "1.0" as const,
  idempotencyKey,
  actor: {
    id: testIds.principal,
    kind: "human" as const,
    securityDomain: "example-domain",
  },
  source: { kind: "api" as const, sourceId: "verified-draft-delivery-fixture" },
  kind: "DispatchTask" as const,
  target: { kind: "task" as const, id: testIds.task },
  requiredCapabilities: ["terminal"],
});

class ResumeAfterRecordedAnswerPolicy implements CoordinatorPolicyEngine {
  readonly #store: InMemoryCoordinatorDurableStore;
  readonly decisions: PolicyDecision[] = [];

  constructor(store: InMemoryCoordinatorDurableStore) {
    this.#store = store;
  }

  async evaluate(): Promise<PolicyDecision> {
    const decision = policyDecision(
      this.#store.attentionResponses.length === 0 ? "requires-approval" : "allow",
    );
    this.decisions.push(decision);
    return decision;
  }
}

class ScriptedSessionFactory implements CodexAppServerSessionFactory {
  readonly #transport: ScriptedJsonRpcTransport;
  readonly launches: string[] = [];

  constructor(transport: ScriptedJsonRpcTransport) {
    this.#transport = transport;
  }

  async inspectProtocol() {
    return {
      protocolVersion: "0.1.0",
      executableReference: "approved-local:codex-app-server",
      localStdioOnly: true,
    };
  }

  async createSession(input: {
    readonly launch: {
      readonly workingDirectory: string;
    };
  }): Promise<CodexAppServerSession> {
    this.launches.push(input.launch.workingDirectory);
    return this.#transport;
  }
}

describe("replayable verified draft-delivery fixture", () => {
  it("records a human answer, resumes the retained run, separates verification, and creates one replay-safe draft", async () => {
    const clock = new DeterministicClock();
    const coordinatorStore = new InMemoryCoordinatorDurableStore();
    const policy = new ResumeAfterRecordedAnswerPolicy(coordinatorStore);
    const ingressStore = new InMemorySlackIngressStore();
    const authorizer = new StaticSlackWorkspaceActorAuthorizer();
    const acknowledger = new RecordingSlackSocketAcknowledger();
    const audience = new StaticSlackAttentionAudienceResolver();
    const outbox = new RecordingSlackAttentionOutbox();
    const transport = new ScriptedJsonRpcTransport([
      { method: "initialize", params: { clientInfo: { name: "agent-ops", version: "0.1.0" } }, result: { serverInfo: { name: "fixture" } } },
      { type: "notification", method: "initialized", params: {} },
      { method: "thread/start", params: { cwd: "/workspace/example", model: "fixture-model" }, result: { thread: { id: "fixture-thread" } } },
      { method: "turn/start", params: { threadId: "fixture-thread", input: [{ type: "text", text: "Apply only the reversible fixture change." }] }, result: { turn: { id: "fixture-turn" } } },
    ]);
    const provider = new CodexAppServerProvider(
      new ScriptedSessionFactory(transport),
      { model: "fixture-model" },
    );
    let providerObservation: Awaited<ReturnType<CodexAppServerProvider["start"]>> | undefined;
    const workerDispatch: CoordinatorWorkerDispatch = {
      async dispatch(input) {
        providerObservation = await provider.start(buildProviderInvocation({
          envelope: input.envelope,
          input: { prompt: "Apply only the reversible fixture change." },
        }));
        return {
          accepted: true,
          acknowledgement: {
            providerSessionRef: "provider-session:fixture",
            acknowledgedAt: clock.now(),
          },
        };
      },
    };

    const resumeDispatch = {
      command: dispatchCommand("resume-verified-draft-delivery-001"),
      envelope: buildJobEnvelope(),
      candidates: [{
        workerId: testIds.worker,
        providerId: "codex-app-server",
        securityDomain: "example-domain",
        capabilities: new Set(["terminal", "git"]),
        skills: [{ key: "repository-inspection", version: "1.2.0", bundleId: "core-primitives" }],
        healthy: true,
        preferenceScore: 1,
      }],
    };
    let runtime: CoordinatorRuntime;
    const commandPort: SlackCoordinatorCommandPort = {
      async handle(input) {
        assert.equal(input.command.kind, "AnswerAttentionItem");
        assert.ok(input.response);
        const result = await runtime.answerAndResume({
          answer: { command: input.command, response: input.response },
          dispatch: resumeDispatch,
        });
        assert.equal(result.dispatch.kind, "queued");
        return {
          durability: "durably-recorded",
          outcome: "attention-response-recorded",
        };
      },
    };
    const slack = new SlackSocketModeAttentionAdapter({
      configuration: {
        appId: "fixture-app",
        appTokenRef: "secret://agentops/slack/app-token",
        botTokenRef: "secret://agentops/slack/bot-token",
        socketMode: true,
        publicHttpIngress: false,
      },
      clock,
      ingressStore,
      actorAuthorizer: authorizer,
      coordinator: commandPort,
      acknowledger,
      audienceResolver: audience,
      outbox,
    });
    runtime = new CoordinatorRuntime({
      clock,
      store: coordinatorStore,
      policy,
      workerDispatch,
      attentionDelivery: slack,
    });

    const initial = await runtime.dispatch({
      command: dispatchCommand("initial-verified-draft-delivery-001"),
      envelope: buildJobEnvelope(),
      candidates: resumeDispatch.candidates,
    });
    assert.equal(initial.kind, "attention-required");
    assert.equal(initial.reason, "approval-required");
    const ingress = await slack.handleEnvelope({
      envelopeId: "fixture-envelope-001",
      type: "slash_commands",
      acceptsResponsePayload: false,
      payload: {
        kind: "slash-command",
        workspaceId: "fixture-workspace",
        actorExternalId: "fixture-actor",
        command: "/agentops",
        text: `answer ${initial.attention.id} proceed with the reversible fixture`,
      },
    });

    assert.equal(ingress.disposition, "accepted");
    assert.deepEqual(coordinatorStore.operations, [
      "intent",
      "scheduling",
      "attention",
      "attention-response",
      "intent",
      "scheduling",
      "job",
      "provider-acknowledgement",
    ]);
    assert.deepEqual(ingressStore.operations, ["ingress-reserve", "ingress-complete:accepted"]);
    assert.deepEqual(acknowledger.acknowledgements, [{ envelopeId: "fixture-envelope-001" }]);
    assert.equal(coordinatorStore.attentionResponses.length, 1);
    assert.equal(coordinatorStore.jobs[0]?.envelope.runId, testIds.run);
    assert.equal(providerObservation?.state, "running");
    assert.equal(providerObservation?.operation, "start");
    assert.equal(outbox.messages.length, 2);
    assert.doesNotMatch(JSON.stringify(outbox.messages), /proceed with the reversible fixture/);
    transport.assertComplete();

    const verification: VerificationRecord = {
      version: "1.0",
      id: testIds.verification,
      taskId: testIds.task,
      runId: testIds.run,
      securityDomain: "example-domain",
      verifierId: "independent-fixture",
      verdict: "pass",
      summary: "A separate deterministic verifier accepted the reversible fixture evidence.",
      implementationEvidenceRefs: ["evidence://fixture/codex-provider-observation"],
      verifiedAt: clock.now(),
    };
    const deliveryStore = new InMemoryDraftDeliveryStore();
    const verifier = new StaticIndependentVerifier(verification);
    const deliveryPolicy = new StaticDraftDeliveryPolicy(policyDecision("allow"));
    const gateway = new RecordingDraftPullRequestGateway();
    const delivery = new VerifiedDraftDeliveryService({
      clock,
      store: deliveryStore,
      verifier,
      policy: deliveryPolicy,
      gateway,
    });
    const intent: DraftPullRequestIntent = {
      version: "1.0",
      deliveryId: testIds.delivery,
      idempotencyKey: "verified-draft-delivery-fixture-001",
      taskId: testIds.task,
      runId: testIds.run,
      securityDomain: "example-domain",
      repositoryRef: "repo://fixture/reversible-change",
      headRef: "refs/heads/agentops/fixture-change",
      baseRef: "refs/heads/main",
      title: "Fixture reversible change",
      verificationId: testIds.verification,
      policyDecisionId: testIds.policy,
      draft: true,
      requestedAt: clock.now(),
    };
    const first = await delivery.deliver(intent);
    const replay = await delivery.deliver(intent);

    assert.equal(first.kind, "draft-created");
    assert.deepEqual(replay, first);
    assert.deepEqual(deliveryStore.operations, [
      "delivery-reserve",
      "verification",
      "delivery-gate-allow",
      "delivery-complete",
      "delivery-reserve",
    ]);
    assert.equal(deliveryStore.verifications[0]?.verifierId, "independent-fixture");
    assert.notDeepEqual(deliveryStore.verifications[0], providerObservation);
    assert.equal(gateway.intents.length, 1);
    assert.equal(deliveryPolicy.calls.length, 1);
  });
});
