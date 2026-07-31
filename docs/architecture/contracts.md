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
  bundles: Array<{ bundleId: string; version: string; primitiveKeys: string[] }>;
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
  inspectCapabilities(): Promise<ProviderCapabilityManifest>;
  validateEnvironment(input: ProviderInvocation): Promise<ProviderEnvironmentVerdict>;
  start(input: ProviderInvocation): Promise<ProviderObservation>;
  sendInput(input: ProviderInvocation): Promise<ProviderObservation>;
  inspect(input: ProviderInvocation): Promise<ProviderObservation>;
  pause(input: ProviderInvocation): Promise<ProviderObservation>;
  resume(input: ProviderInvocation): Promise<ProviderObservation>;
  cancel(input: ProviderInvocation): Promise<ProviderObservation>;
  collectArtifacts(input: ProviderInvocation): Promise<ProviderArtifact[]>;
}

type ProviderInvocation = {
  version: string;
  invocationId: string;
  operation: "validate-environment" | "start" | "send-input" | "inspect" | "pause" | "resume" | "cancel" | "collect-artifacts";
  envelope: JobEnvelope;
  input: Record<string, unknown>; // secret-safe only
  requestedAt: string;
};

type ProviderObservation = {
  version: string;
  providerId: ProviderId;
  invocationId: string;
  operation: ProviderInvocation["operation"];
  observedAt: string;
  state: "pending" | "starting" | "running" | "paused" | "attention" | "failed" | "cancelled" | "complete" | "unknown";
  sourceEventId: string;
  detail: Record<string, unknown>; // secret-safe only
};

type VerificationVerdict = "pass" | "conditional-pass" | "needs-human-review" | "fail";

type VerificationRecord = {
  version: string;
  id: string;
  taskId: string;
  runId: string;
  securityDomain: SecurityDomain;
  verifierId: string;
  verdict: VerificationVerdict;
  summary: string;
  implementationEvidenceRefs: string[];
  verifiedAt: string;
};

type DraftPullRequestIntent = {
  version: string;
  deliveryId: string;
  idempotencyKey: string;
  taskId: string;
  runId: string;
  securityDomain: SecurityDomain;
  repositoryRef: string;
  headRef: string;
  baseRef: string;
  title: string;
  verificationId: string;
  policyDecisionId: string;
  draft: true;
  requestedAt: string;
};

type CoordinatorProjectionCommand = {
  version: string;
  commandId: string;
  actor: { id: string; kind: "coordinator"; securityDomain: SecurityDomain };
  taskId: string;
  runId: string;
  securityDomain: SecurityDomain;
  projection: ExternalProjectionIntent;
  issuedAt: string;
};

type ExternalProjectionIntent =
  | { kind: "github-draft-pull-request"; draft: true; verificationId: string; repositoryRef: string; title: string; links: ProjectionLink[] }
  | { kind: "github-ci-evidence"; pullRequestRef: string; evidenceRef: string; conclusion: VerificationVerdict; links: ProjectionLink[] }
  | { kind: "portfolio-transition"; transition: "created" | "ready-for-review" | "blocked" | "completed" | "failed" | "running" | "provider-observed"; summary: string; links: ProjectionLink[] };

type ProjectionLink = {
  kind: "issue" | "slice" | "pull-request" | "external-session";
  system: "github" | "portfolio" | "roadmap" | "external";
  externalRef: string; // bounded opaque reference, never an endpoint or credential
};

type ExternalProjectionFact = {
  version: string;
  projectionId: string;
  taskId: string;
  runId: string;
  securityDomain: SecurityDomain;
  system: "github" | "portfolio";
  externalRef: string;
  source: { kind: "integration"; id: string };
  sourceEventId: string;
  occurredAt: string;
  ingestedAt: string;
  metadata: Record<string, unknown>; // secret-safe only
};

type AttentionItem = {
  id: string;
  runId: string;
  type: "question" | "approval" | "authentication" | "review" | "security" | "infrastructure" | "failure";
  summary: string;
  verbatimQuestion?: string;
  response?: DurableResponse;
};

type PrimitiveBundleManifest = {
  version: string;
  bundleId: string;
  bundleVersion: string;
  sourceRef: string; // generic bundle reference only
  primitives: Array<{
    key: string;
    version: string;
    purpose: string;
    capabilities: Capability[];
    securityDomains: SecurityDomain[];
    outputContract: { kind: string; redaction: "required"; maximumRecords: number };
    enforcement: Array<{ harness: string; level: "enforced" | "advisory"; mechanism: string }>;
  }>;
  publishedAt: string;
};

type EstimateRecord = {
  version: string;
  id: string;
  taskId: string;
  runId: string;
  securityDomain: SecurityDomain;
  estimator: { id: string; version: string; model: string };
  basis: { calibrationVersion: string; evidenceRefs: string[] };
  agentRounds: { low: number; expected: number; high: number };
  wallClockSeconds: { low: number; expected: number; high: number };
  supersedesEstimateId?: string;
  estimatedAt: string;
};

type EffortMeasurement = {
  version: string;
  id: string;
  taskId: string;
  runId: string;
  securityDomain: SecurityDomain;
  measure: "agent-execution" | "human-attention" | "blocked" | "verification";
  durationSeconds: number;
  occurredAt: string;
};

type AllocationRecord = {
  version: string;
  id: string;
  taskId: string;
  runId: string;
  securityDomain: SecurityDomain;
  category: "direct" | "fully-loaded" | "human-inclusive" | "failure-adjusted";
  allocationMethod: "direct-usage" | "fixed-pool" | "human-time" | "failure-adjustment";
  rateCardId: string;
  rateCardVersion: string;
  accountingSystemOfRecord: "external";
};

type CompatibilityManifest = {
  version: string;
  id: string;
  releaseId: string;
  releaseRef: string; // generic opaque release reference
  declarations: Array<{
    component: "coordinator-api" | "worker-runtime" | "provider-sdk" | "provider-adapter" | "policy" | "database-schema" | "job-contract" | "event-contract" | "skill-bundle";
    currentVersion: string;
    acceptsVersionRange: string;
    backwardCompatibility: "backward-compatible" | "requires-expand-migration" | "incompatible-blocked";
  }>;
};

type PromotionRecord = {
  version: string;
  id: string;
  releaseId: string;
  compatibilityManifestId: string;
  fromChannel: "development" | "canary";
  toChannel: "canary" | "stable";
  compatibilityCheck: { verdict: "passed"; evidenceRefs: string[] };
  approval: { approvalRef: string; approvedBy: ActorRef /* human */ };
};

type MigrationGate = {
  version: string;
  id: string;
  releaseId: string;
  appendOnly: true;
  strategy: "expand-before-contract";
  operation: "additive" | "destructive";
  backupVerificationId?: string;
  approval?: { approvalRef: string; approvedBy: ActorRef /* human */ };
  forwardRepairRunbookRef?: string;
};

type BackupVerificationRecord = {
  version: string;
  id: string;
  releaseId: string;
  backupRef: string; // generic opaque reference, never a location or secret
  coverage: ["durable-operational-state", "versioned-configuration", "persistent-memory-data", "documented-secret-references"];
  integrity: "verified";
  restoration: "verified";
  evidenceRefs: string[];
};

type WorkerReplacementRecord = {
  version: string;
  id: string;
  releaseId: string;
  retiredWorkerId: string;
  replacementWorkerId: string;
  durableLedger: { ledgerRef: string; immutableRecordIds: string[] };
  restoredLedgerRecordIds: string[];
  enrollment: { bootstrap: true; registration: true; validation: true; provisioning: true; health: true; controlledDrain: true };
};

type ReleaseGateRecord = {
  version: string;
  id: string;
  releaseId: string;
  compatibilityManifestId: string;
  promotionIds: [string, string];
  migrationGateIds: string[];
  backupVerificationId: string;
  replacementRecordId: string;
  redactionVerification: "passed";
  criticalSafetyTests: Array<{ id: string; status: "passed"; evidenceRefs: string[] }>;
  verdict: "passed";
};

type RoadmapWorktreeIntent = {
  version: string;
  correlationId: string;
  taskId: string;
  runId: string;
  securityDomain: SecurityDomain;
  slice: { key: string; pi: string; sprint: string; wave: number };
  gate: { source: "roadmap"; expression: string };
  worktree: {
    authority: "roadmap";
    branch: string;
    reference: string;
    preparation: "not-started";
  };
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

The Roadmap adapter uses only Roadmap's structured read-only `plan` and `show`
operations. It validates a current ready wave and gate, preserves stable
correlation/task/run/slice/worktree references, and emits a `not-started`
worktree intent. It never parses the Roadmap graph directly, creates a
worktree, launches an agent, or invokes a mutating Roadmap operation.

The Slack attention adapter accepts only a minimized Socket Mode envelope and
maps an authorized workspace actor to an internal human principal. It reserves
a durable ingress receipt before invoking the Coordinator-owned command port,
completes that receipt before Socket acknowledgement, and reuses the same
idempotency key for a retry. Its configuration holds `secret://` references
only; HTTP ingress and signing-secret configuration are rejected. An attention
summary and an exact worker question are separate domain-scoped projections,
and authentication remains out-of-band. Slack has no task/run, worker,
provider, or Scheduler authority.

`VerificationRecord` is a distinct durable evidence type, not a
`ProviderObservation`. A verified draft-delivery service reserves its
idempotent delivery before recording a verification result, records a matching
policy decision before projecting, and may create only an intent with
`draft: true`. A completed result is replayable without another verifier,
policy, or gateway call; failure remains pending for a future authorized
outbox retry. The public boundary owns no GitHub SDK, repository, process,
network, merge, release, or deployment behavior.

The provider SDK validates a complete lifecycle declaration, routes only by
declared capability (with a human-selected provider preference as a tie-breaker
only), and normalizes correlated provider observations before a future durable
core can consume them. Providers never update task or run state directly.
`PrintProvider` is the deterministic reference implementation: it records one
sealed, secret-safe plan per lifecycle operation and reports
`execution: "not-started"`. It does not render job body, callback, or signature
material and contains no process-execution API. It is a test double, not a
worker launcher or an execution backend.

The two normalized CLI adapters use the same contract but retain distinct
truthful operation support. `codex-app-server` is an injected local-stdio
JSON-RPC turn protocol. `claude-code` is an injected local-stdio one-shot print
mode with JSONL output, policy-supplied turn and budget caps, no session
persistence, and `dontAsk` permission refusal; its send-input, pause, and
resume operations are explicitly unsupported. Both reduce provider output to
secret-safe correlated observations and bounded artifacts, exclude transcripts
and authentication material, refuse protocol data containing inline secrets,
and prohibit automatic restart. Neither package includes a process launcher,
credential binding, or runtime account assumption.

External projections are Coordinator-issued requests, not a generic external
write API. The projection service reserves a durable idempotency record before
calling a named GitHub or portfolio gateway, accepts only a source-provenance
fact that matches the task/run/domain/destination, and converts an outage or
bad fact to a redacted retryable state. Portfolio `running` and
`provider-observed` transitions are suppressed before either durable or
external delivery. Explicit replay is owned by a future authorized outbox
runner; this source contains no SDK, network client, credentials, timer, or
background retry loop.

Portable primitives and independent estimation are also compositional
boundaries. A generic bundle manifest has no host, session, credential, or
installation data; Worker manifests retain bundle membership alongside skill
versions. The Coordinator's pure placement filter rejects a missing or
incompatible required enforced primitive before a job is written or sent to a
worker. A future catalog/installation workflow remains an explicit,
separately-authorized attention path.

Estimate, effort, rate-card, allocation, and planning-feedback records retain
the same task/run/security-domain lineage. An independent estimator supplies
ranges, model, calibration, and evidence through an injected port; AgentOps
does not reproduce its logic. Agent, human, blocked, and verification time are
separate. Rate cards and allocation methods are versioned source facts, while
an `external` accounting system remains authoritative for transactions and
invoices. Strict planning feedback holds relative points but cannot add a
currency field.

Contract evolution requires compatibility behavior, acceptance updates, and an ADR when the architectural boundary changes.
