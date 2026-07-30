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
  resourceBudget: ResourceBudget;
  redactionPolicy: RedactionPolicyRef;
  callbackIdentity: CallbackIdentityRef;
  signature: Signature;
};

type WorkerManifest = {
  version: string;
  workerId: string;
  principalId: string;
  securityDomain: SecurityDomain;
  runtimeVersion: string;
  capabilities: Capability[];
  skills: SkillManifestEntry[];
  providers: ProviderManifestEntry[];
  generatedAt: string;
};

type WorkerRegistration = {
  version: string;
  registrationId: string;
  bootId: string;
  manifest: WorkerManifest;
  resources: WorkerResourceSnapshot;
  mode: "idle" | "busy" | "draining" | "quarantined";
  automaticResume: false;
  occurredAt: string;
};

type WorkerHeartbeat = {
  version: string;
  workerId: string;
  bootId: string;
  sequence: number;
  mode: "idle" | "busy" | "draining" | "quarantined";
  activeJobIds: string[];
  resources: WorkerResourceSnapshot;
  occurredAt: string;
};

type SafetyAuditRecord = {
  version: string;
  policyVersion: string;
  decision: "allow" | "warn" | "block" | "require-approval" | "remediate" | "quarantine-worker";
  workerTransition: "none" | "drain" | "quarantine";
  findings: Array<{ code: string; severity: "info" | "warning" | "critical"; evidence: Record<string, unknown> }>;
  remediation: {
    kind: "none" | "cleanup-proposal";
    mode: "none" | "dry-run";
    targets: string[];
    evidencePreserved: boolean;
    outcome: "not-needed" | "proposed" | "not-executed";
  };
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

The Phase 3 worker supervisor consumes these contracts through injected ports.
It has no inbound listener or provider-launch port. Startup registers an idle
supervisor with `automaticResume: false`; job admission requires verified
policy and signature decisions, trusted verification of the Coordinator-held
fencing lease and its expiry, domain and path scope, compatible capabilities
and skills, and bounded resource reservations. The worker principal is never
treated as the Coordinator lease holder. Duplicate accepted envelopes return
their prior admission without emitting a second lifecycle event.

`WorkerSafetyMonitor` is a separately invocable monitor adapter: an approved
external scheduler may call a sweep even while an agent is hung. The monitor
only evaluates an injected snapshot, emits a secret-safe `SafetyAuditRecord`,
and asks the supervisor to apply a drain or quarantine transition. It owns no
timer, host command, deletion, process kill, service, or provider-launch port.
Cleanup is a dry-run proposal only; broad or recursive deletion requires a
recorded approval and a replacement set of explicit targets before any future
execution adapter may act.

Contract evolution requires compatibility behavior, acceptance updates, and an ADR when the architectural boundary changes.
