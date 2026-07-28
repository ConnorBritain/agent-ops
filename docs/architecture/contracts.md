# Public contract boundary

All contracts are versioned and transport-neutral. The following are architectural interfaces, not Phase 0 runtime APIs.

```ts
type Command = {
  version: string;
  idempotencyKey: string;
  actor: ActorRef;
  source: IntentSource;
  kind: "CreateTask" | "DispatchTask" | "AnswerAttentionItem" | "ApproveAction" | "PauseRun" | "ResumeRun" | "CancelRun" | "MoveRun" | "InspectRun" | "SummarizePortfolio";
  target: TargetRef;
  requiredCapabilities: Capability[];
  providerPreference?: ProviderId;
};

type JobEnvelope = {
  version: string;
  jobId: string;
  taskId: string;
  runId: string;
  securityDomain: SecurityDomain;
  requiredCapabilities: Capability[];
  requiredSkills: SkillRequirement[];
  policyDecision: PolicyDecisionRef;
  lease: ExpiringLease;
  safeWorkingDirectory: SafePath;
  redactionPolicy: RedactionPolicyRef;
  callbackIdentity: CallbackIdentityRef;
  signature: Signature;
};

type NormalizedEvent = {
  version: string;
  type: EventType;
  entity: EntityRef;
  source: SourceRef;
  sourceEventId: string;
  occurredAt: string;
  ingestedAt: string;
  payload: unknown;
};

interface Provider {
  inspectCapabilities(): Promise<CapabilityManifest>;
  validateEnvironment(input: ProviderPreflight): Promise<PreflightResult>;
  start(input: ProviderStart): Promise<ProviderObservation>;
  sendInput(input: ProviderInput): Promise<ProviderObservation>;
  inspect(input: ProviderInspection): Promise<ProviderObservation>;
  pause(input: ProviderControl): Promise<ProviderObservation>;
  resume(input: ProviderControl): Promise<ProviderObservation>;
  cancel(input: ProviderControl): Promise<ProviderObservation>;
  collectArtifacts(input: ProviderInspection): Promise<Artifact[]>;
}

type VerificationVerdict = "pass" | "conditional-pass" | "needs-human-review" | "fail";

type AttentionItem = {
  id: string;
  runId: string;
  type: "question" | "approval" | "authentication" | "review" | "security" | "infrastructure" | "failure";
  summary: string;
  verbatimQuestion?: string;
  response?: DurableResponse;
};
```

Contract evolution requires compatibility behavior, acceptance updates, and an ADR when the architectural boundary changes.
