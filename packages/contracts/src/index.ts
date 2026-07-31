import { z } from "zod";

export const CONTRACT_VERSION = "1.0" as const;

const contractVersionSchema = z.literal(CONTRACT_VERSION);
const uuidSchema = z.uuid();
const rfc3339Schema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
  "expected an RFC 3339 timestamp with an explicit offset",
);

export const securityDomainSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,62}$/);

export const secretRefSchema = z
  .string()
  .regex(/^secret:\/\/[A-Za-z0-9/_-]+$/);

const sensitiveKey = /(password|passphrase|token|api[_-]?key|secret|private[_-]?key|service[_-]?role[_-]?key)/i;
const tokenLikeValue = /(xox[baprs]-|xapp-|ghp_|github_pat_|sb_secret_|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)/i;

export type SecretFinding = {
  readonly path: readonly (string | number)[];
  readonly reason: string;
};

export function findInlineSecret(
  value: unknown,
  path: readonly (string | number)[] = [],
): SecretFinding | undefined {
  if (typeof value === "string") {
    if (value.startsWith("secret://")) return undefined;
    if (tokenLikeValue.test(value)) {
      return { path, reason: "token-like or private-key value" };
    }
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      const finding = findInlineSecret(child, [...path, index]);
      if (finding) return finding;
    }
    return undefined;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (
        sensitiveKey.test(key)
        && !(typeof child === "string" && child.startsWith("secret://"))
      ) {
        return {
          path: [...path, key],
          reason: "secret-bearing field must contain an approved secret:// reference",
        };
      }
      const finding = findInlineSecret(child, [...path, key]);
      if (finding) return finding;
    }
  }
  return undefined;
}

export function assertNoInlineSecrets(value: unknown): void {
  const finding = findInlineSecret(value);
  if (!finding) return;
  const location = finding.path.length ? finding.path.join(".") : "<root>";
  throw new Error(`Inline secret rejected at ${location}: ${finding.reason}`);
}

const secretSafeObjectSchema = z
  .record(z.string(), z.unknown())
  .superRefine((value, context) => {
    const finding = findInlineSecret(value);
    if (!finding) return;
    context.addIssue({
      code: "custom",
      message: finding.reason,
      path: [...finding.path],
    });
  });

export const capabilitySchema = z.string().regex(/^[a-z][a-z0-9:._-]{1,120}$/);

export const actorRefSchema = z.object({
  id: uuidSchema,
  kind: z.enum(["human", "coordinator", "worker", "integration"]),
  securityDomain: securityDomainSchema,
}).strict();

export const intentSourceSchema = z.object({
  kind: z.enum(["cli", "chat", "api", "reconciler", "roadmap"]),
  sourceId: z.string().min(1).max(200),
}).strict();

export const targetRefSchema = z.object({
  kind: z.enum(["project", "task", "run", "attention-item", "portfolio"]),
  id: uuidSchema,
}).strict();

export const commandSchema = z.object({
  version: contractVersionSchema,
  idempotencyKey: z.string().min(8).max(200),
  actor: actorRefSchema,
  source: intentSourceSchema,
  kind: z.enum([
    "CreateTask",
    "DispatchTask",
    "AnswerAttentionItem",
    "ApproveAction",
    "PauseRun",
    "ResumeRun",
    "CancelRun",
    "MoveRun",
    "InspectRun",
    "SummarizePortfolio",
  ]),
  target: targetRefSchema,
  requiredCapabilities: z.array(capabilitySchema).max(100),
  providerPreference: z.string().min(1).max(120).optional(),
}).strict();

export type Command = z.infer<typeof commandSchema>;

export const expiringLeaseSchema = z.object({
  leaseName: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
  holderId: uuidSchema,
  fencingToken: z.number().int().positive().safe(),
  expiresAt: rfc3339Schema,
}).strict();

export const skillRequirementSchema = z.object({
  key: z.string().min(1).max(160),
  versionRange: z.string().min(1).max(120),
}).strict();

export const resourceBudgetSchema = z.object({
  minimumFreeDiskBytes: z.number().int().nonnegative().safe(),
  memoryReservationBytes: z.number().int().positive().safe(),
  worktreeSlots: z.number().int().nonnegative().max(100),
  maximumRuntimeSeconds: z.number().int().positive().safe(),
}).strict();

export type ResourceBudget = z.infer<typeof resourceBudgetSchema>;

export const signedJobEnvelopeSchema = z.object({
  version: contractVersionSchema,
  jobId: uuidSchema,
  taskId: uuidSchema,
  runId: uuidSchema,
  securityDomain: securityDomainSchema,
  requiredCapabilities: z.array(capabilitySchema).max(100),
  requiredSkills: z.array(skillRequirementSchema).max(100),
  policyDecisionId: uuidSchema,
  lease: expiringLeaseSchema,
  safeWorkingDirectory: z.string().min(1).max(4096),
  resourceBudget: resourceBudgetSchema.optional(),
  redactionPolicyRef: z.string().min(1).max(200),
  callbackIdentityRef: secretRefSchema,
  body: secretSafeObjectSchema,
  signature: z.object({
    algorithm: z.enum(["ed25519"]),
    keyRef: secretRefSchema,
    value: z.string().min(32).max(4096),
  }).strict(),
}).strict();

export type SignedJobEnvelope = z.infer<typeof signedJobEnvelopeSchema>;

const semanticVersionSchema = z.string().regex(
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/,
  "expected a semantic version",
);

export const workerSkillManifestEntrySchema = z.object({
  key: z.string().min(1).max(160),
  version: semanticVersionSchema,
}).strict();

export const workerProviderManifestEntrySchema = z.object({
  providerId: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
  version: semanticVersionSchema,
  capabilities: z.array(capabilitySchema).max(100),
}).strict();

const addDuplicateIssues = (
  values: readonly string[],
  field: string,
  context: z.RefinementCtx,
) => {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) {
      context.addIssue({
        code: "custom",
        message: `duplicate ${field}: ${value}`,
        path: [field, index],
      });
    }
    seen.add(value);
  }
};

export const workerManifestSchema = z.object({
  version: contractVersionSchema,
  workerId: uuidSchema,
  principalId: uuidSchema,
  securityDomain: securityDomainSchema,
  runtimeVersion: semanticVersionSchema,
  capabilities: z.array(capabilitySchema).max(100),
  skills: z.array(workerSkillManifestEntrySchema).max(100),
  providers: z.array(workerProviderManifestEntrySchema).max(100),
  generatedAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  addDuplicateIssues(value.capabilities, "capabilities", context);
  addDuplicateIssues(value.skills.map((skill) => skill.key), "skills", context);
  addDuplicateIssues(value.providers.map((provider) => provider.providerId), "providers", context);
});

export type WorkerManifest = z.infer<typeof workerManifestSchema>;

export const workerResourceSnapshotSchema = z.object({
  freeDiskBytes: z.number().int().nonnegative().safe(),
  availableMemoryBytes: z.number().int().nonnegative().safe(),
  activeWorktreeCount: z.number().int().nonnegative().safe(),
  runningJobCount: z.number().int().nonnegative().safe(),
}).strict();

export type WorkerResourceSnapshot = z.infer<typeof workerResourceSnapshotSchema>;

export const workerModeSchema = z.enum(["idle", "busy", "draining", "quarantined"]);
export type WorkerMode = z.infer<typeof workerModeSchema>;

export const workerRegistrationSchema = z.object({
  version: contractVersionSchema,
  registrationId: uuidSchema,
  bootId: uuidSchema,
  manifest: workerManifestSchema,
  resources: workerResourceSnapshotSchema,
  mode: workerModeSchema,
  automaticResume: z.literal(false),
  occurredAt: rfc3339Schema,
}).strict();

export type WorkerRegistration = z.infer<typeof workerRegistrationSchema>;

export const workerHeartbeatSchema = z.object({
  version: contractVersionSchema,
  workerId: uuidSchema,
  bootId: uuidSchema,
  sequence: z.number().int().nonnegative().safe(),
  mode: workerModeSchema,
  activeJobIds: z.array(uuidSchema).max(1_000),
  resources: workerResourceSnapshotSchema,
  occurredAt: rfc3339Schema,
}).strict();

export type WorkerHeartbeat = z.infer<typeof workerHeartbeatSchema>;

export const safetyDecisionKindSchema = z.enum([
  "allow",
  "warn",
  "block",
  "require-approval",
  "remediate",
  "quarantine-worker",
]);

export type SafetyDecisionKind = z.infer<typeof safetyDecisionKindSchema>;

export const safetyWorkerTransitionSchema = z.enum([
  "none",
  "drain",
  "quarantine",
]);

export type SafetyWorkerTransition = z.infer<typeof safetyWorkerTransitionSchema>;

export const safetyFindingSchema = z.object({
  code: z.string().regex(/^[a-z][a-z0-9-]{1,120}$/),
  severity: z.enum(["info", "warning", "critical"]),
  evidence: secretSafeObjectSchema,
}).strict();

export type SafetyFinding = z.infer<typeof safetyFindingSchema>;

const secretSafeTargetSchema = z.string().min(1).max(4096).superRefine((value, context) => {
  const finding = findInlineSecret(value);
  if (!finding) return;
  context.addIssue({ code: "custom", message: finding.reason });
});

export const safetyRemediationSchema = z.object({
  kind: z.enum(["none", "cleanup-proposal"]),
  mode: z.enum(["none", "dry-run"]),
  targets: z.array(secretSafeTargetSchema).max(100),
  evidencePreserved: z.boolean(),
  outcome: z.enum(["not-needed", "proposed", "not-executed"]),
}).strict().superRefine((value, context) => {
  if (value.kind === "none" && (value.mode !== "none" || value.targets.length > 0)) {
    context.addIssue({
      code: "custom",
      message: "A no-op remediation cannot include a mode or targets.",
    });
  }
  if (value.kind === "cleanup-proposal" && value.mode !== "dry-run") {
    context.addIssue({
      code: "custom",
      message: "Cleanup proposals must be dry-run only.",
    });
  }
});

export type SafetyRemediation = z.infer<typeof safetyRemediationSchema>;

export const safetyAuditRecordSchema = z.object({
  version: contractVersionSchema,
  policyVersion: semanticVersionSchema,
  decision: safetyDecisionKindSchema,
  workerTransition: safetyWorkerTransitionSchema,
  findings: z.array(safetyFindingSchema).max(100),
  remediation: safetyRemediationSchema,
}).strict().superRefine((value, context) => {
  if (value.decision === "quarantine-worker" && value.workerTransition !== "quarantine") {
    context.addIssue({
      code: "custom",
      message: "A quarantine-worker decision must quarantine the worker.",
    });
  }
  if (
    value.workerTransition !== "none"
    && (value.decision === "allow" || value.decision === "warn")
  ) {
    context.addIssue({
      code: "custom",
      message: "An allow or warn decision cannot transition a worker.",
    });
  }
});

export type SafetyAuditRecord = z.infer<typeof safetyAuditRecordSchema>;

export const normalizedEventSchema = z.object({
  version: contractVersionSchema,
  type: z.string().regex(/^[a-z][a-z0-9.-]{1,120}$/),
  entity: z.object({
    type: z.string().regex(/^[a-z][a-z0-9-]{1,80}$/),
    id: uuidSchema,
  }).strict(),
  source: z.object({
    kind: z.enum(["human", "coordinator", "worker", "provider", "integration", "system"]),
    id: z.string().min(1).max(200),
  }).strict(),
  sourceEventId: z.string().min(1).max(240),
  securityDomain: securityDomainSchema,
  taskId: uuidSchema.optional(),
  runId: uuidSchema.optional(),
  occurredAt: rfc3339Schema,
  ingestedAt: rfc3339Schema,
  payload: secretSafeObjectSchema,
}).strict();

export type NormalizedEvent = z.infer<typeof normalizedEventSchema>;

export const verificationVerdictSchema = z.enum([
  "pass",
  "conditional-pass",
  "needs-human-review",
  "fail",
]);

export type VerificationVerdict = z.infer<typeof verificationVerdictSchema>;

const evidenceReferenceSchema = z
  .string()
  .regex(/^(?:evidence|test):\/\/[A-Za-z0-9._/-]{1,240}$/);

/**
 * A verifier records its own conclusion rather than relying on an
 * implementation provider's observation. Evidence references are opaque,
 * secret-safe locators; transcript and credential values do not belong here.
 */
export const verificationRecordSchema = z.object({
  version: contractVersionSchema,
  id: uuidSchema,
  taskId: uuidSchema,
  runId: uuidSchema,
  securityDomain: securityDomainSchema,
  verifierId: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
  verdict: verificationVerdictSchema,
  summary: z.string().min(1).max(1_000),
  implementationEvidenceRefs: z.array(evidenceReferenceSchema).min(1).max(100),
  verifiedAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  const finding = findInlineSecret(value);
  if (!finding) return;
  context.addIssue({ code: "custom", message: finding.reason, path: [...finding.path] });
});

export type VerificationRecord = z.infer<typeof verificationRecordSchema>;

/**
 * This is an immutable request to create a draft pull request. It cannot
 * express merge, review dismissal, release, deployment, or a non-draft write.
 */
export const draftPullRequestIntentSchema = z.object({
  version: contractVersionSchema,
  deliveryId: uuidSchema,
  idempotencyKey: z.string().min(8).max(200),
  taskId: uuidSchema,
  runId: uuidSchema,
  securityDomain: securityDomainSchema,
  repositoryRef: z.string().regex(/^repo:\/\/[A-Za-z0-9._/-]{1,240}$/),
  headRef: z.string().regex(/^refs\/heads\/[A-Za-z0-9._/-]{1,240}$/),
  baseRef: z.string().regex(/^refs\/heads\/[A-Za-z0-9._/-]{1,240}$/),
  title: z.string().min(1).max(240),
  verificationId: uuidSchema,
  policyDecisionId: uuidSchema,
  draft: z.literal(true),
  requestedAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  const finding = findInlineSecret(value);
  if (!finding) return;
  context.addIssue({ code: "custom", message: finding.reason, path: [...finding.path] });
});

export type DraftPullRequestIntent = z.infer<typeof draftPullRequestIntentSchema>;

/**
 * External references are opaque, bounded identifiers rather than URLs or
 * credentials. A concrete adapter resolves an approved reference at its
 * composition boundary; contracts and durable records never need a host name,
 * token, or raw provider response.
 */
export const externalReferenceSchema = z
  .string()
  .regex(/^(?:github|portfolio|roadmap|external):\/\/[A-Za-z0-9._/-]{1,240}$/);

export const projectionLinkSchema = z.object({
  kind: z.enum(["issue", "slice", "pull-request", "external-session"]),
  system: z.enum(["github", "portfolio", "roadmap", "external"]),
  externalRef: externalReferenceSchema,
}).strict().superRefine((value, context) => {
  if (!value.externalRef.startsWith(`${value.system}://`)) {
    context.addIssue({
      code: "custom",
      message: "Projection link reference must use the declared external system scheme.",
    });
  }
  if (value.kind === "slice" && value.system !== "roadmap") {
    context.addIssue({
      code: "custom",
      message: "A roadmap slice mapping must use the roadmap external system.",
    });
  }
  if (value.kind === "pull-request" && value.system !== "github") {
    context.addIssue({
      code: "custom",
      message: "A pull-request mapping must use the github external system.",
    });
  }
});

export type ProjectionLink = z.infer<typeof projectionLinkSchema>;

const projectionLinkListSchema = z.array(projectionLinkSchema).min(1).max(100)
  .superRefine((links, context) => {
    const seen = new Set<string>();
    for (const [index, link] of links.entries()) {
      const identity = `${link.kind}:${link.system}:${link.externalRef}`;
      if (seen.has(identity)) {
        context.addIssue({
          code: "custom",
          message: `duplicate projection link: ${identity}`,
          path: [index],
        });
      }
      seen.add(identity);
    }
  });

export const portfolioTransitionSchema = z.enum([
  "created",
  "ready-for-review",
  "blocked",
  "completed",
  "failed",
  "running",
  "provider-observed",
]);

export type PortfolioTransition = z.infer<typeof portfolioTransitionSchema>;

const projectionIntentBase = {
  version: contractVersionSchema,
  projectionId: uuidSchema,
  idempotencyKey: z.string().min(8).max(200),
  taskId: uuidSchema,
  runId: uuidSchema,
  securityDomain: securityDomainSchema,
  links: projectionLinkListSchema,
  requestedAt: rfc3339Schema,
};

/**
 * These are the only public projection payloads. They intentionally omit
 * merge, review, deployment, release, arbitrary issue mutation, and a generic
 * remote write escape hatch.
 */
export const externalProjectionIntentSchema = z.discriminatedUnion("kind", [
  z.object({
    ...projectionIntentBase,
    kind: z.literal("github-draft-pull-request"),
    repositoryRef: z.string().regex(/^repo:\/\/[A-Za-z0-9._/-]{1,240}$/),
    title: z.string().min(1).max(240),
    verificationId: uuidSchema,
    draft: z.literal(true),
  }).strict(),
  z.object({
    ...projectionIntentBase,
    kind: z.literal("github-ci-evidence"),
    pullRequestRef: z.string().regex(/^github:\/\/[A-Za-z0-9._/-]{1,240}$/),
    evidenceRef: evidenceReferenceSchema,
    conclusion: verificationVerdictSchema,
  }).strict(),
  z.object({
    ...projectionIntentBase,
    kind: z.literal("portfolio-transition"),
    transition: portfolioTransitionSchema,
    summary: z.string().min(1).max(1_000),
  }).strict(),
]).superRefine((value, context) => {
  const finding = findInlineSecret(value);
  if (!finding) return;
  context.addIssue({ code: "custom", message: finding.reason, path: [...finding.path] });
});

export type ExternalProjectionIntent = z.infer<typeof externalProjectionIntentSchema>;

export const coordinatorProjectionCommandSchema = z.object({
  version: contractVersionSchema,
  commandId: uuidSchema,
  actor: actorRefSchema,
  taskId: uuidSchema,
  runId: uuidSchema,
  securityDomain: securityDomainSchema,
  projection: externalProjectionIntentSchema,
  issuedAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  if (value.actor.kind !== "coordinator") {
    context.addIssue({
      code: "custom",
      message: "External projection requires a Coordinator-issued command.",
      path: ["actor", "kind"],
    });
  }
  if (value.actor.securityDomain !== value.securityDomain) {
    context.addIssue({
      code: "custom",
      message: "Projection command actor must share the command security domain.",
      path: ["actor", "securityDomain"],
    });
  }
  for (const field of ["taskId", "runId", "securityDomain"] as const) {
    if (value.projection[field] !== value[field]) {
      context.addIssue({
        code: "custom",
        message: `Projection ${field} must match its Coordinator command.`,
        path: ["projection", field],
      });
    }
  }
  const finding = findInlineSecret(value);
  if (!finding) return;
  context.addIssue({ code: "custom", message: finding.reason, path: [...finding.path] });
});

export type CoordinatorProjectionCommand = z.infer<typeof coordinatorProjectionCommandSchema>;

export const externalProjectionFactSchema = z.object({
  version: contractVersionSchema,
  projectionId: uuidSchema,
  taskId: uuidSchema,
  runId: uuidSchema,
  securityDomain: securityDomainSchema,
  system: z.enum(["github", "portfolio"]),
  externalRef: externalReferenceSchema,
  source: z.object({
    kind: z.literal("integration"),
    id: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
  }).strict(),
  sourceEventId: z.string().min(1).max(200),
  occurredAt: rfc3339Schema,
  ingestedAt: rfc3339Schema,
  metadata: secretSafeObjectSchema,
}).strict().superRefine((value, context) => {
  if (!value.externalRef.startsWith(`${value.system}://`)) {
    context.addIssue({
      code: "custom",
      message: "Projection fact reference must use the declared external system scheme.",
      path: ["externalRef"],
    });
  }
  const finding = findInlineSecret(value);
  if (!finding) return;
  context.addIssue({ code: "custom", message: finding.reason, path: [...finding.path] });
});

export type ExternalProjectionFact = z.infer<typeof externalProjectionFactSchema>;

export const attentionItemSchema = z.object({
  version: contractVersionSchema,
  id: uuidSchema,
  taskId: uuidSchema,
  runId: uuidSchema.optional(),
  securityDomain: securityDomainSchema,
  type: z.enum([
    "question",
    "approval",
    "authentication",
    "review",
    "security",
    "infrastructure",
    "failure",
  ]),
  summary: z.string().min(1).max(1000),
  verbatimQuestion: z.string().max(4000).optional(),
  durableResponse: secretSafeObjectSchema.optional(),
}).strict();

export type AttentionItem = z.infer<typeof attentionItemSchema>;

export const roadmapStatusSchema = z.enum([
  "active",
  "next",
  "scheduled",
  "complete",
  "blocked",
  "paused",
  "gated",
  "optionality",
]);

export const roadmapSliceKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,120}$/, "expected a stable Roadmap slice key");

const roadmapReferenceSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => !value.includes("\u0000"), "reference must not contain a NUL byte");

export const roadmapPlanSliceSchema = z.object({
  invoke: roadmapSliceKeySchema,
  pi: roadmapSliceKeySchema,
  sprint: roadmapSliceKeySchema,
  status: roadmapStatusSchema,
  branch: roadmapReferenceSchema,
  worktree: roadmapReferenceSchema,
  what: z.string().min(1).max(4_000),
  suggestedConcurrency: z.number().int().positive().max(100),
});

export type RoadmapPlanSlice = z.infer<typeof roadmapPlanSliceSchema>;

export const roadmapPlanSchema = z.object({
  waves: z.array(z.array(roadmapPlanSliceSchema).max(100)).max(100),
});

export const roadmapSliceDetailSchema = z.object({
  invoke: roadmapSliceKeySchema,
  pi: roadmapSliceKeySchema,
  sprint: roadmapSliceKeySchema,
  status: roadmapStatusSchema,
  gate: z.string().min(1).max(4_000),
  gatedOn: z.string().min(1).max(4_000).nullable().optional(),
});

export const roadmapWorktreeIntentRequestSchema = z.object({
  version: contractVersionSchema,
  correlationId: uuidSchema,
  taskId: uuidSchema,
  runId: uuidSchema,
  securityDomain: securityDomainSchema,
  sliceKey: roadmapSliceKeySchema,
  requestedAt: rfc3339Schema,
}).strict();

export type RoadmapWorktreeIntentRequest = z.infer<typeof roadmapWorktreeIntentRequestSchema>;

export const roadmapWorktreeIntentSchema = z.object({
  version: contractVersionSchema,
  correlationId: uuidSchema,
  taskId: uuidSchema,
  runId: uuidSchema,
  securityDomain: securityDomainSchema,
  slice: z.object({
    key: roadmapSliceKeySchema,
    pi: roadmapSliceKeySchema,
    sprint: roadmapSliceKeySchema,
    wave: z.number().int().nonnegative().max(99),
  }).strict(),
  gate: z.object({
    source: z.literal("roadmap"),
    expression: z.string().min(1).max(4_000),
  }).strict(),
  worktree: z.object({
    authority: z.literal("roadmap"),
    branch: roadmapReferenceSchema,
    reference: roadmapReferenceSchema,
    preparation: z.literal("not-started"),
  }).strict(),
}).strict();

export type RoadmapWorktreeIntent = z.infer<typeof roadmapWorktreeIntentSchema>;

export const PROVIDER_OPERATIONS = [
  "validate-environment",
  "start",
  "send-input",
  "inspect",
  "pause",
  "resume",
  "cancel",
  "collect-artifacts",
] as const;

export const providerOperationSchema = z.enum(PROVIDER_OPERATIONS);
export type ProviderOperation = z.infer<typeof providerOperationSchema>;

export const providerIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,62}$/);

export const providerLifecycleDeclarationSchema = z.object({
  operation: providerOperationSchema,
  support: z.enum(["supported", "unsupported"]),
}).strict();

export const providerCapabilityManifestSchema = z.object({
  version: contractVersionSchema,
  providerId: providerIdSchema,
  providerVersion: semanticVersionSchema,
  executionMode: z.enum(["no-execution", "bounded-execution"]),
  capabilities: z.array(capabilitySchema).max(100),
  lifecycle: z.array(providerLifecycleDeclarationSchema).length(PROVIDER_OPERATIONS.length),
}).strict().superRefine((value, context) => {
  addDuplicateIssues(value.capabilities, "capabilities", context);
  addDuplicateIssues(value.lifecycle.map((entry) => entry.operation), "lifecycle operation", context);
  const declared = new Set(value.lifecycle.map((entry) => entry.operation));
  for (const operation of PROVIDER_OPERATIONS) {
    if (!declared.has(operation)) {
      context.addIssue({
        code: "custom",
        message: `missing lifecycle declaration: ${operation}`,
        path: ["lifecycle"],
      });
    }
  }
});

export type ProviderCapabilityManifest = z.infer<typeof providerCapabilityManifestSchema>;

export const providerInvocationSchema = z.object({
  version: contractVersionSchema,
  invocationId: uuidSchema,
  operation: providerOperationSchema,
  envelope: signedJobEnvelopeSchema,
  input: secretSafeObjectSchema,
  requestedAt: rfc3339Schema,
}).strict();

export type ProviderInvocation = z.infer<typeof providerInvocationSchema>;

export const providerStateSchema = z.enum([
  "pending",
  "starting",
  "running",
  "paused",
  "attention",
  "failed",
  "cancelled",
  "complete",
  "unknown",
]);

export type ProviderState = z.infer<typeof providerStateSchema>;

export const providerObservationSchema = z.object({
  version: contractVersionSchema,
  providerId: providerIdSchema,
  invocationId: uuidSchema,
  operation: providerOperationSchema,
  observedAt: rfc3339Schema,
  state: providerStateSchema,
  sourceEventId: z.string().min(1).max(240),
  detail: secretSafeObjectSchema,
}).strict();

export type ProviderObservation = z.infer<typeof providerObservationSchema>;

export const providerEnvironmentVerdictSchema = z.object({
  version: contractVersionSchema,
  providerId: providerIdSchema,
  invocationId: uuidSchema,
  accepted: z.boolean(),
  reasons: z.array(z.string().min(1).max(240)).max(100),
  detail: secretSafeObjectSchema,
}).strict();

export type ProviderEnvironmentVerdict = z.infer<typeof providerEnvironmentVerdictSchema>;

export const providerArtifactSchema = z.object({
  version: contractVersionSchema,
  providerId: providerIdSchema,
  invocationId: uuidSchema,
  kind: z.string().regex(/^[a-z][a-z0-9-]{1,120}$/),
  mediaType: z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i),
  data: secretSafeObjectSchema,
}).strict();

export type ProviderArtifact = z.infer<typeof providerArtifactSchema>;

export interface Provider {
  inspectCapabilities(): Promise<ProviderCapabilityManifest>;
  validateEnvironment(input: ProviderInvocation): Promise<ProviderEnvironmentVerdict>;
  start(input: ProviderInvocation): Promise<ProviderObservation>;
  sendInput(input: ProviderInvocation): Promise<ProviderObservation>;
  inspect(input: ProviderInvocation): Promise<ProviderObservation>;
  pause(input: ProviderInvocation): Promise<ProviderObservation>;
  resume(input: ProviderInvocation): Promise<ProviderObservation>;
  cancel(input: ProviderInvocation): Promise<ProviderObservation>;
  collectArtifacts(input: ProviderInvocation): Promise<readonly ProviderArtifact[]>;
}
