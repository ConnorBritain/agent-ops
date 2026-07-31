import {
  CONTRACT_VERSION,
  browserHumanConfirmationSchema,
  browserObservationRequestSchema,
  providerInvocationSchema,
  type BrowserHumanConfirmation,
  type BrowserObservationEvidence,
  type BrowserObservationRequest,
  type HumanBrowserEvidencePort,
  type Provider,
  type ProviderArtifact,
  type ProviderCapabilityManifest,
  type ProviderEnvironmentVerdict,
  type ProviderInvocation,
  type ProviderObservation,
  type ProviderOperation,
  type ProviderState,
} from "@agent-ops/contracts";
import {
  assertRedactedBrowserEvidence,
  evaluateBrowserHumanConfirmation,
  evaluateBrowserObservationPolicy,
  type BrowserObservationPolicyDecision,
} from "@agent-ops/policy";

const PROVIDER_ID = "observed-browser";
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

type BrowserSession = {
  readonly request: BrowserObservationRequest;
  readonly decision: BrowserObservationPolicyDecision;
  state: ProviderState;
  evidence?: BrowserObservationEvidence;
  confirmation?: BrowserHumanConfirmation;
};

const manifest = (): ProviderCapabilityManifest => ({
  version: CONTRACT_VERSION,
  providerId: PROVIDER_ID,
  providerVersion: PROVIDER_VERSION,
  executionMode: "no-execution",
  capabilities: ["browser:observe", "browser:human-confirmation"],
  browser: {
    maturity: "human-observed",
    automation: "none",
    autonomousDesktopControl: false,
    supportedControls: ["observe", "request-human-confirmation"],
  },
  lifecycle: lifecycle.map((operation) => ({ operation, support: "supported" })),
});

const expectedOperation = (input: ProviderInvocation, operation: ProviderOperation): ProviderInvocation => {
  const invocation = providerInvocationSchema.parse(input);
  if (invocation.operation !== operation) {
    throw new Error(`ObservedBrowserProvider expected ${operation}, received ${invocation.operation}.`);
  }
  return invocation;
};

const requestFor = (input: ProviderInvocation): BrowserObservationRequest => {
  const request = browserObservationRequestSchema.parse(input.input.browserRequest);
  if (
    request.taskId !== input.envelope.taskId
    || request.runId !== input.envelope.runId
    || request.securityDomain !== input.envelope.securityDomain
  ) {
    throw new Error("Browser observation request must correlate with its sealed job envelope.");
  }
  return request;
};

const confirmationFor = (input: ProviderInvocation): BrowserHumanConfirmation | undefined => {
  if (input.input.humanConfirmation === undefined) return undefined;
  return browserHumanConfirmationSchema.parse(input.input.humanConfirmation);
};

/**
 * A no-execution provider boundary for human browser observation. Its sole
 * port reads already-redacted evidence; it does not start a browser, send
 * browser input, control a desktop, or use a remote-access product.
 */
export class ObservedBrowserProvider implements Provider {
  readonly #evidencePort: HumanBrowserEvidencePort;
  readonly #sessions = new Map<string, BrowserSession>();

  constructor(evidencePort: HumanBrowserEvidencePort) {
    this.#evidencePort = evidencePort;
  }

  async inspectCapabilities(): Promise<ProviderCapabilityManifest> {
    return manifest();
  }

  async validateEnvironment(input: ProviderInvocation): Promise<ProviderEnvironmentVerdict> {
    const invocation = expectedOperation(input, "validate-environment");
    const request = requestFor(invocation);
    const declared = await this.inspectCapabilities();
    const decision = evaluateBrowserObservationPolicy({ manifest: declared, request });
    const missing = invocation.envelope.requiredCapabilities
      .filter((capability) => !declared.capabilities.includes(capability));
    const reasons = [
      ...missing.map((capability) => `missing-capability:${capability}`),
      ...(decision.decision === "block" ? [decision.reason] : []),
    ];
    return {
      version: CONTRACT_VERSION,
      providerId: PROVIDER_ID,
      invocationId: invocation.invocationId,
      accepted: reasons.length === 0,
      reasons,
      detail: {
        execution: "not-executed",
        maturity: "human-observed",
        automation: "none",
        policyDecision: decision.decision,
        policyReason: decision.reason,
      },
    };
  }

  async start(input: ProviderInvocation): Promise<ProviderObservation> {
    const invocation = expectedOperation(input, "start");
    if (this.#sessions.has(invocation.invocationId)) {
      throw new Error("Observed browser sessions do not restart automatically; create a new authorized invocation.");
    }
    const request = requestFor(invocation);
    const decision = evaluateBrowserObservationPolicy({ manifest: await this.inspectCapabilities(), request });
    const session: BrowserSession = { request, decision, state: "attention" };
    this.#sessions.set(invocation.invocationId, session);
    if (decision.decision === "block") {
      session.state = "failed";
      return this.#observation(invocation, session, "browser-request-refused");
    }
    try {
      const evidence = await this.#evidencePort.readRedactedEvidence(request);
      session.evidence = assertRedactedBrowserEvidence({ request, evidence });
      return this.#observation(invocation, session, "human-observation-recorded");
    } catch {
      return this.#observation(invocation, session, "human-observation-unavailable");
    }
  }

  async sendInput(input: ProviderInvocation): Promise<ProviderObservation> {
    const invocation = expectedOperation(input, "send-input");
    const session = this.#sessionFor(invocation);
    const confirmation = confirmationFor(invocation);
    if (!confirmation) return this.#observation(invocation, session, "human-confirmation-not-supplied");
    const confirmationDecision = evaluateBrowserHumanConfirmation({
      request: session.request,
      confirmation,
    });
    if (confirmationDecision.decision === "recorded") session.confirmation = confirmation;
    return this.#observation(invocation, session, confirmationDecision.reason);
  }

  async inspect(input: ProviderInvocation): Promise<ProviderObservation> {
    const invocation = expectedOperation(input, "inspect");
    return this.#observation(invocation, this.#sessionFor(invocation), "human-observation-status");
  }

  async pause(input: ProviderInvocation): Promise<ProviderObservation> {
    const invocation = expectedOperation(input, "pause");
    const session = this.#sessionFor(invocation);
    if (session.state !== "failed" && session.state !== "cancelled") session.state = "paused";
    return this.#observation(invocation, session, "handoff-paused");
  }

  async resume(input: ProviderInvocation): Promise<ProviderObservation> {
    const invocation = expectedOperation(input, "resume");
    const session = this.#sessionFor(invocation);
    if (session.state === "paused") session.state = "attention";
    return this.#observation(invocation, session, "handoff-awaits-human");
  }

  async cancel(input: ProviderInvocation): Promise<ProviderObservation> {
    const invocation = expectedOperation(input, "cancel");
    const session = this.#sessionFor(invocation);
    session.state = "cancelled";
    return this.#observation(invocation, session, "handoff-cancelled");
  }

  async collectArtifacts(input: ProviderInvocation): Promise<readonly ProviderArtifact[]> {
    const invocation = expectedOperation(input, "collect-artifacts");
    const session = this.#sessionFor(invocation);
    if (!session.evidence) return [];
    return [{
      version: CONTRACT_VERSION,
      providerId: PROVIDER_ID,
      invocationId: invocation.invocationId,
      kind: "redacted-browser-observation",
      mediaType: "application/json",
      data: {
        evidenceId: session.evidence.evidenceId,
        targetDomain: session.evidence.targetDomain,
        classification: session.evidence.classification,
        rawContentRetained: false,
        redactionVerified: true,
      },
    }];
  }

  #sessionFor(invocation: ProviderInvocation): BrowserSession {
    const session = this.#sessions.get(invocation.invocationId);
    if (!session) throw new Error("Observed browser lifecycle requires an explicit start handoff.");
    requestFor(invocation);
    return session;
  }

  #observation(
    invocation: ProviderInvocation,
    session: BrowserSession,
    outcome: string,
  ): ProviderObservation {
    return {
      version: CONTRACT_VERSION,
      providerId: PROVIDER_ID,
      invocationId: invocation.invocationId,
      operation: invocation.operation,
      observedAt: invocation.requestedAt,
      state: session.state,
      sourceEventId: `observed-browser:${invocation.invocationId}:${invocation.operation}`,
      detail: {
        execution: "not-executed",
        outcome,
        policyDecision: session.decision.decision,
        policyReason: session.decision.reason,
        evidenceRecorded: Boolean(session.evidence),
        humanConfirmationRecorded: Boolean(session.confirmation),
      },
    };
  }
}
