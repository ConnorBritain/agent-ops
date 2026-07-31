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
  /** Only deterministic/enforced primitives may be required for dispatch. */
  enforcement: z.literal("enforced").default("enforced"),
}).strict();

export type SkillRequirement = z.infer<typeof skillRequirementSchema>;

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
  bundleId: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
}).strict();

export const workerSkillBundleManifestEntrySchema = z.object({
  bundleId: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
  version: semanticVersionSchema,
  primitiveKeys: z.array(z.string().min(1).max(160)).min(1).max(100),
}).strict().superRefine((value, context) => {
  addDuplicateIssues(value.primitiveKeys, "primitiveKeys", context);
});

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
  bundles: z.array(workerSkillBundleManifestEntrySchema).max(100),
  providers: z.array(workerProviderManifestEntrySchema).max(100),
  generatedAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  addDuplicateIssues(value.capabilities, "capabilities", context);
  addDuplicateIssues(value.skills.map((skill) => skill.key), "skills", context);
  addDuplicateIssues(value.bundles.map((bundle) => bundle.bundleId), "bundles", context);
  addDuplicateIssues(value.providers.map((provider) => provider.providerId), "providers", context);
  for (const [index, skill] of value.skills.entries()) {
    const bundle = value.bundles.find((candidate) => candidate.bundleId === skill.bundleId);
    if (!bundle || !bundle.primitiveKeys.includes(skill.key)) {
      context.addIssue({
        code: "custom",
        message: "Worker skill must be declared by its installed bundle.",
        path: ["skills", index, "bundleId"],
      });
    }
  }
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

const primitiveKeySchema = z.string().regex(/^[a-z][a-z0-9-]{1,120}$/);

export const primitiveEnforcementSchema = z.object({
  harness: z.enum(["generic", "codex-app-server", "claude-code"]),
  level: z.enum(["enforced", "advisory"]),
  mechanism: z.enum(["deterministic-code", "provider-instruction", "human-process"]),
}).strict().superRefine((value, context) => {
  if (value.level === "enforced" && value.mechanism !== "deterministic-code") {
    context.addIssue({
      code: "custom",
      message: "An enforced primitive must name deterministic-code enforcement.",
    });
  }
});

export const portablePrimitiveSchema = z.object({
  key: primitiveKeySchema,
  version: semanticVersionSchema,
  purpose: z.string().min(1).max(1_000),
  capabilities: z.array(capabilitySchema).max(100),
  securityDomains: z.array(securityDomainSchema).min(1).max(100),
  access: z.object({
    reads: z.array(z.enum(["task-ledger", "repository-metadata", "attention-item"])).max(20),
    writes: z.array(z.enum(["attention-item", "draft-delivery", "finops-record"])).max(20),
  }).strict(),
  outputContract: z.object({
    kind: z.string().regex(/^[a-z][a-z0-9-]{1,120}$/),
    redaction: z.literal("required"),
    maximumRecords: z.number().int().positive().max(1_000),
  }).strict(),
  enforcement: z.array(primitiveEnforcementSchema).min(1).max(20),
}).strict().superRefine((value, context) => {
  addDuplicateIssues(value.capabilities, "capabilities", context);
  addDuplicateIssues(value.securityDomains, "securityDomains", context);
  const harnesses = value.enforcement.map((entry) => entry.harness);
  addDuplicateIssues(harnesses, "enforcement", context);
  const finding = findInlineSecret(value);
  if (!finding) return;
  context.addIssue({ code: "custom", message: finding.reason, path: [...finding.path] });
});

export type PortablePrimitive = z.infer<typeof portablePrimitiveSchema>;

export const primitiveBundleManifestSchema = z.object({
  version: contractVersionSchema,
  bundleId: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
  bundleVersion: semanticVersionSchema,
  sourceRef: z.string().regex(/^bundle:\/\/[A-Za-z0-9._/-]{1,240}$/),
  primitives: z.array(portablePrimitiveSchema).min(1).max(100),
  publishedAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  addDuplicateIssues(value.primitives.map((primitive) => primitive.key), "primitives", context);
  const finding = findInlineSecret(value);
  if (!finding) return;
  context.addIssue({ code: "custom", message: finding.reason, path: [...finding.path] });
});

export type PrimitiveBundleManifest = z.infer<typeof primitiveBundleManifestSchema>;

/**
 * A deliberately conservative static audit. The strict manifest has no host,
 * session, credential, endpoint, or runtime-fact field; this second check also
 * refuses those concepts if somebody attempts to smuggle them into free text.
 */
export function assertPortablePrimitiveBundle(raw: unknown): PrimitiveBundleManifest {
  const manifest = primitiveBundleManifestSchema.parse(raw);
  assertNoInlineSecrets(manifest);
  const serialized = JSON.stringify(manifest);
  if (/(?:host[ _-]?availability|session[ _-]?id|credential|secret:\/\/)/i.test(serialized)) {
    throw new Error("Portable primitive bundles must not embed host, session, credential, or secret facts.");
  }
  return manifest;
}

const nonNegativeFiniteNumber = z.number().finite().nonnegative();

export const estimateRangeSchema = z.object({
  low: nonNegativeFiniteNumber,
  expected: nonNegativeFiniteNumber,
  high: nonNegativeFiniteNumber,
}).strict().superRefine((value, context) => {
  if (value.low > value.expected || value.expected > value.high) {
    context.addIssue({
      code: "custom",
      message: "Estimate ranges must satisfy low <= expected <= high.",
    });
  }
});

export const estimateRecordSchema = z.object({
  version: contractVersionSchema,
  id: uuidSchema,
  taskId: uuidSchema,
  runId: uuidSchema,
  securityDomain: securityDomainSchema,
  estimator: z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
    version: semanticVersionSchema,
    model: z.string().min(1).max(160),
  }).strict(),
  basis: z.object({
    calibrationVersion: semanticVersionSchema,
    evidenceRefs: z.array(evidenceReferenceSchema).min(1).max(100),
  }).strict(),
  agentRounds: estimateRangeSchema,
  wallClockSeconds: estimateRangeSchema,
  supersedesEstimateId: uuidSchema.optional(),
  estimatedAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  const finding = findInlineSecret(value);
  if (!finding) return;
  context.addIssue({ code: "custom", message: finding.reason, path: [...finding.path] });
});

export type EstimateRecord = z.infer<typeof estimateRecordSchema>;

export const effortMeasurementSchema = z.object({
  version: contractVersionSchema,
  id: uuidSchema,
  taskId: uuidSchema,
  runId: uuidSchema,
  securityDomain: securityDomainSchema,
  measure: z.enum(["agent-execution", "human-attention", "blocked", "verification"]),
  durationSeconds: nonNegativeFiniteNumber,
  source: z.object({
    kind: z.enum(["coordinator", "worker", "human", "verifier", "integration"]),
    id: z.string().min(1).max(200),
  }).strict(),
  occurredAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  const finding = findInlineSecret(value);
  if (!finding) return;
  context.addIssue({ code: "custom", message: finding.reason, path: [...finding.path] });
});

export type EffortMeasurement = z.infer<typeof effortMeasurementSchema>;

const currencySchema = z.string().regex(/^[A-Z]{3}$/);

export const rateCardSchema = z.object({
  version: contractVersionSchema,
  id: uuidSchema,
  rateCardVersion: semanticVersionSchema,
  sourceRef: z.string().regex(/^rate-card:\/\/[A-Za-z0-9._/-]{1,240}$/),
  entries: z.array(z.object({
    key: z.string().regex(/^[a-z][a-z0-9-]{1,120}$/),
    unit: z.string().regex(/^[a-z][a-z0-9-]{1,80}$/),
    amount: nonNegativeFiniteNumber,
    currency: currencySchema,
  }).strict()).min(1).max(1_000),
  effectiveAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  addDuplicateIssues(value.entries.map((entry) => entry.key), "entries", context);
  const finding = findInlineSecret(value);
  if (!finding) return;
  context.addIssue({ code: "custom", message: finding.reason, path: [...finding.path] });
});

export type RateCard = z.infer<typeof rateCardSchema>;

export const allocationRecordSchema = z.object({
  version: contractVersionSchema,
  id: uuidSchema,
  taskId: uuidSchema,
  runId: uuidSchema,
  securityDomain: securityDomainSchema,
  category: z.enum(["direct", "fully-loaded", "human-inclusive", "failure-adjusted"]),
  allocationMethod: z.enum(["direct-usage", "fixed-pool", "human-time", "failure-adjustment"]),
  rateCardId: uuidSchema,
  rateCardVersion: semanticVersionSchema,
  rateKey: z.string().regex(/^[a-z][a-z0-9-]{1,120}$/),
  quantity: nonNegativeFiniteNumber,
  unit: z.string().regex(/^[a-z][a-z0-9-]{1,80}$/),
  amount: nonNegativeFiniteNumber,
  currency: currencySchema,
  accountingSystemOfRecord: z.literal("external"),
  allocatedAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  const finding = findInlineSecret(value);
  if (!finding) return;
  context.addIssue({ code: "custom", message: finding.reason, path: [...finding.path] });
});

export type AllocationRecord = z.infer<typeof allocationRecordSchema>;

export const planningFeedbackSchema = z.object({
  version: contractVersionSchema,
  id: uuidSchema,
  taskId: uuidSchema,
  runId: uuidSchema,
  securityDomain: securityDomainSchema,
  planningRecordRef: z.string().regex(/^planning:\/\/[A-Za-z0-9._/-]{1,240}$/),
  relativePoints: nonNegativeFiniteNumber,
  estimateId: uuidSchema,
  effortMeasurementIds: z.array(uuidSchema).min(1).max(100),
  allocationIds: z.array(uuidSchema).min(1).max(100),
  outcomeVerdict: verificationVerdictSchema,
  recordedAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  addDuplicateIssues(value.effortMeasurementIds, "effortMeasurementIds", context);
  addDuplicateIssues(value.allocationIds, "allocationIds", context);
  const finding = findInlineSecret(value);
  if (!finding) return;
  context.addIssue({ code: "custom", message: finding.reason, path: [...finding.path] });
});

export type PlanningFeedback = z.infer<typeof planningFeedbackSchema>;

/**
 * Release-recovery records deliberately use internal UUIDs and opaque generic
 * references. They declare evidence and approval boundaries; they do not name
 * hosts, backup locations, cloud projects, credentials, or deployment APIs.
 */
export const RELEASE_COMPATIBILITY_COMPONENTS = [
  "coordinator-api",
  "worker-runtime",
  "provider-sdk",
  "provider-adapter",
  "policy",
  "database-schema",
  "job-contract",
  "event-contract",
  "skill-bundle",
] as const;

export const releaseCompatibilityComponentSchema = z.enum(RELEASE_COMPATIBILITY_COMPONENTS);
export type ReleaseCompatibilityComponent = z.infer<typeof releaseCompatibilityComponentSchema>;

/** A deliberately small, declarative semver range grammar for compatibility records. */
export const compatibilityVersionRangeSchema = z.string().regex(
  /^(?:\*|(?:\^|~|>=|>|<=|<)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\s+(?:\^|~|>=|>|<=|<)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?){0,7})$/,
  "expected a bounded semantic-version compatibility range",
);

export const releaseChannelSchema = z.enum(["development", "canary", "stable"]);
export type ReleaseChannel = z.infer<typeof releaseChannelSchema>;

export const compatibilityDeclarationSchema = z.object({
  component: releaseCompatibilityComponentSchema,
  currentVersion: semanticVersionSchema,
  acceptsVersionRange: compatibilityVersionRangeSchema,
  /** New contracts must state their backwards-compatibility behavior. */
  backwardCompatibility: z.enum([
    "backward-compatible",
    "requires-expand-migration",
    "incompatible-blocked",
  ]),
}).strict();

export type CompatibilityDeclaration = z.infer<typeof compatibilityDeclarationSchema>;

export const compatibilityManifestSchema = z.object({
  version: contractVersionSchema,
  id: uuidSchema,
  releaseId: uuidSchema,
  releaseRef: z.string().regex(/^release:\/\/[A-Za-z0-9._/-]{1,240}$/),
  declarations: z.array(compatibilityDeclarationSchema)
    .length(RELEASE_COMPATIBILITY_COMPONENTS.length),
  generatedAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  addDuplicateIssues(value.declarations.map((entry) => entry.component), "compatibility component", context);
  const declared = new Set(value.declarations.map((entry) => entry.component));
  for (const component of RELEASE_COMPATIBILITY_COMPONENTS) {
    if (!declared.has(component)) {
      context.addIssue({
        code: "custom",
        message: `missing release compatibility declaration: ${component}`,
        path: ["declarations"],
      });
    }
  }
  const finding = findInlineSecret(value);
  if (finding) context.addIssue({ code: "custom", message: finding.reason, path: [...finding.path] });
});

export type CompatibilityManifest = z.infer<typeof compatibilityManifestSchema>;

export const humanApprovalSchema = z.object({
  approvalRef: z.string().regex(/^approval:\/\/[A-Za-z0-9._/-]{1,240}$/),
  approvedBy: actorRefSchema.refine((actor) => actor.kind === "human", {
    message: "Release approval must be recorded by a human actor.",
  }),
  approvedAt: rfc3339Schema,
}).strict();

export type HumanApproval = z.infer<typeof humanApprovalSchema>;

export const promotionRecordSchema = z.object({
  version: contractVersionSchema,
  id: uuidSchema,
  releaseId: uuidSchema,
  compatibilityManifestId: uuidSchema,
  fromChannel: releaseChannelSchema,
  toChannel: releaseChannelSchema,
  compatibilityCheck: z.object({
    verdict: z.literal("passed"),
    evidenceRefs: z.array(evidenceReferenceSchema).min(1).max(100),
    checkedAt: rfc3339Schema,
  }).strict(),
  approval: humanApprovalSchema,
  promotedAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  const allowed = (value.fromChannel === "development" && value.toChannel === "canary")
    || (value.fromChannel === "canary" && value.toChannel === "stable");
  if (!allowed) {
    context.addIssue({
      code: "custom",
      message: "Promotion must follow development -> canary or canary -> stable.",
      path: ["toChannel"],
    });
  }
  const finding = findInlineSecret(value);
  if (finding) context.addIssue({ code: "custom", message: finding.reason, path: [...finding.path] });
});

export type PromotionRecord = z.infer<typeof promotionRecordSchema>;

export const backupVerificationRecordSchema = z.object({
  version: contractVersionSchema,
  id: uuidSchema,
  releaseId: uuidSchema,
  backupRef: z.string().regex(/^backup:\/\/[A-Za-z0-9._/-]{1,240}$/),
  coverage: z.array(z.enum([
    "durable-operational-state",
    "versioned-configuration",
    "persistent-memory-data",
    "documented-secret-references",
  ])).length(4),
  integrity: z.literal("verified"),
  restoration: z.literal("verified"),
  evidenceRefs: z.array(evidenceReferenceSchema).min(1).max(100),
  verifiedAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  addDuplicateIssues(value.coverage, "backup coverage", context);
  const finding = findInlineSecret(value);
  if (finding) context.addIssue({ code: "custom", message: finding.reason, path: [...finding.path] });
});

export type BackupVerificationRecord = z.infer<typeof backupVerificationRecordSchema>;

export const migrationGateSchema = z.object({
  version: contractVersionSchema,
  id: uuidSchema,
  releaseId: uuidSchema,
  migrationRef: z.string().regex(/^migration:\/\/[A-Za-z0-9._/-]{1,240}$/),
  sourceSchemaVersion: semanticVersionSchema,
  targetSchemaVersion: semanticVersionSchema,
  appendOnly: z.literal(true),
  strategy: z.literal("expand-before-contract"),
  operation: z.enum(["additive", "destructive"]),
  backupVerificationId: uuidSchema.optional(),
  approval: humanApprovalSchema.optional(),
  forwardRepairRunbookRef: z.string().regex(/^runbook:\/\/[A-Za-z0-9._/-]{1,240}$/).optional(),
  gatedAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  if (value.operation === "destructive") {
    for (const [field, present] of [
      ["backupVerificationId", Boolean(value.backupVerificationId)],
      ["approval", Boolean(value.approval)],
      ["forwardRepairRunbookRef", Boolean(value.forwardRepairRunbookRef)],
    ] as const) {
      if (!present) {
        context.addIssue({
          code: "custom",
          message: "Destructive migration requires backup verification, human approval, and forward repair instructions.",
          path: [field],
        });
      }
    }
  }
  const finding = findInlineSecret(value);
  if (finding) context.addIssue({ code: "custom", message: finding.reason, path: [...finding.path] });
});

export type MigrationGate = z.infer<typeof migrationGateSchema>;

export const workerReplacementRecordSchema = z.object({
  version: contractVersionSchema,
  id: uuidSchema,
  releaseId: uuidSchema,
  retiredWorkerId: uuidSchema,
  replacementWorkerId: uuidSchema,
  durableLedger: z.object({
    ledgerRef: z.string().regex(/^ledger:\/\/[A-Za-z0-9._/-]{1,240}$/),
    immutableRecordIds: z.array(uuidSchema).min(1).max(10_000),
  }).strict(),
  restoredLedgerRecordIds: z.array(uuidSchema).min(1).max(10_000),
  enrollment: z.object({
    bootstrap: z.literal(true),
    registration: z.literal(true),
    validation: z.literal(true),
    provisioning: z.literal(true),
    health: z.literal(true),
    controlledDrain: z.literal(true),
  }).strict(),
  rehearsedAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  addDuplicateIssues(value.durableLedger.immutableRecordIds, "immutable ledger record", context);
  addDuplicateIssues(value.restoredLedgerRecordIds, "restored ledger record", context);
  if (value.retiredWorkerId === value.replacementWorkerId) {
    context.addIssue({
      code: "custom",
      message: "Replacement worker must have a distinct internal identity.",
      path: ["replacementWorkerId"],
    });
  }
  const finding = findInlineSecret(value);
  if (finding) context.addIssue({ code: "custom", message: finding.reason, path: [...finding.path] });
});

export type WorkerReplacementRecord = z.infer<typeof workerReplacementRecordSchema>;

export const releaseGateRecordSchema = z.object({
  version: contractVersionSchema,
  id: uuidSchema,
  releaseId: uuidSchema,
  compatibilityManifestId: uuidSchema,
  promotionIds: z.array(uuidSchema).length(2),
  migrationGateIds: z.array(uuidSchema).min(1).max(1_000),
  backupVerificationId: uuidSchema,
  replacementRecordId: uuidSchema,
  redactionVerification: z.literal("passed"),
  criticalSafetyTests: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]{1,120}$/),
    status: z.literal("passed"),
    evidenceRefs: z.array(evidenceReferenceSchema).min(1).max(100),
  }).strict()).min(1).max(1_000),
  verdict: z.literal("passed"),
  checkedAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  addDuplicateIssues(value.promotionIds, "promotion", context);
  addDuplicateIssues(value.migrationGateIds, "migration gate", context);
  addDuplicateIssues(value.criticalSafetyTests.map((entry) => entry.id), "critical safety test", context);
  const finding = findInlineSecret(value);
  if (finding) context.addIssue({ code: "custom", message: finding.reason, path: [...finding.path] });
});

export type ReleaseGateRecord = z.infer<typeof releaseGateRecordSchema>;

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

/**
 * This is intentionally a narrow declaration. A browser-capable provider can
 * describe a human-observed path, but it cannot represent autonomous browser
 * input or desktop control as a capability of this architecture.
 */
export const browserProviderMaturitySchema = z.literal("human-observed");
export type BrowserProviderMaturity = z.infer<typeof browserProviderMaturitySchema>;

export const browserSupportedControlSchema = z.enum([
  "observe",
  "request-human-confirmation",
]);
export type BrowserSupportedControl = z.infer<typeof browserSupportedControlSchema>;

export const browserCapabilityDeclarationSchema = z.object({
  maturity: browserProviderMaturitySchema,
  automation: z.literal("none"),
  autonomousDesktopControl: z.literal(false),
  supportedControls: z.array(browserSupportedControlSchema).min(2).max(2),
}).strict().superRefine((value, context) => {
  addDuplicateIssues(value.supportedControls, "supported browser control", context);
  for (const control of browserSupportedControlSchema.options) {
    if (!value.supportedControls.includes(control)) {
      context.addIssue({
        code: "custom",
        message: `missing supported browser control: ${control}`,
        path: ["supportedControls"],
      });
    }
  }
});

export type BrowserCapabilityDeclaration = z.infer<typeof browserCapabilityDeclarationSchema>;

export const providerCapabilityManifestSchema = z.object({
  version: contractVersionSchema,
  providerId: providerIdSchema,
  providerVersion: semanticVersionSchema,
  executionMode: z.enum(["no-execution", "bounded-execution"]),
  capabilities: z.array(capabilitySchema).max(100),
  lifecycle: z.array(providerLifecycleDeclarationSchema).length(PROVIDER_OPERATIONS.length),
  browser: browserCapabilityDeclarationSchema.optional(),
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
  if (value.browser) {
    if (value.executionMode !== "no-execution") {
      context.addIssue({
        code: "custom",
        message: "A human-observed browser provider must declare no-execution mode.",
        path: ["executionMode"],
      });
    }
    for (const capability of ["browser:observe", "browser:human-confirmation"]) {
      if (!value.capabilities.includes(capability)) {
        context.addIssue({
          code: "custom",
          message: `Browser provider missing required capability: ${capability}`,
          path: ["capabilities"],
        });
      }
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

const browserDomainSchema = z.string()
  .trim()
  .toLowerCase()
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    "expected a canonical DNS hostname without a scheme, path, wildcard, or port",
  );

export const browserWriteAuthoritySchema = z.enum([
  "observe-only",
  "human-confirmed-write",
]);
export type BrowserWriteAuthority = z.infer<typeof browserWriteAuthoritySchema>;

export const browserObservationRequestSchema = z.object({
  version: contractVersionSchema,
  requestId: uuidSchema,
  taskId: uuidSchema,
  runId: uuidSchema,
  securityDomain: securityDomainSchema,
  targetDomain: browserDomainSchema,
  allowedDomains: z.array(browserDomainSchema).min(1).max(50),
  requestedAction: z.enum(["observe", "propose-write"]),
  writeAuthority: browserWriteAuthoritySchema,
  humanConfirmationRequired: z.literal(true),
  redactionPolicyRef: z.string().min(1).max(200),
  requestedAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  addDuplicateIssues(value.allowedDomains, "allowed browser domain", context);
});

export type BrowserObservationRequest = z.infer<typeof browserObservationRequestSchema>;

/**
 * This carries a summary deliberately prepared for durable records. Raw page
 * content, cookies, credentials, screenshots, and device identifiers are not
 * part of the public browser contract.
 */
export const browserObservationEvidenceSchema = z.object({
  version: contractVersionSchema,
  evidenceId: z.string().regex(/^[a-z][a-z0-9:_-]{2,160}$/),
  requestId: uuidSchema,
  targetDomain: browserDomainSchema,
  source: z.literal("human-observer"),
  classification: z.enum(["read-only-observation", "write-intent-presented"]),
  redactedSummary: z.string().min(1).max(4_000),
  rawContentRetained: z.literal(false),
  redactionVerified: z.literal(true),
  observedAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  const finding = findInlineSecret({ redactedSummary: value.redactedSummary });
  if (!finding) return;
  context.addIssue({
    code: "custom",
    message: "Browser evidence summary contains token-like material.",
    path: ["redactedSummary"],
  });
});

export type BrowserObservationEvidence = z.infer<typeof browserObservationEvidenceSchema>;

export const browserHumanConfirmationSchema = z.object({
  version: contractVersionSchema,
  confirmationId: uuidSchema,
  requestId: uuidSchema,
  actor: actorRefSchema,
  securityDomain: securityDomainSchema,
  targetDomain: browserDomainSchema,
  writeAuthority: z.literal("human-confirmed-write"),
  decision: z.enum(["approved", "rejected"]),
  occurredAt: rfc3339Schema,
}).strict().superRefine((value, context) => {
  if (value.actor.kind !== "human") {
    context.addIssue({
      code: "custom",
      message: "Browser confirmation must be made by a human actor.",
      path: ["actor", "kind"],
    });
  }
  if (value.actor.securityDomain !== value.securityDomain) {
    context.addIssue({
      code: "custom",
      message: "Browser confirmation actor and record must share a security domain.",
      path: ["actor", "securityDomain"],
    });
  }
});

export type BrowserHumanConfirmation = z.infer<typeof browserHumanConfirmationSchema>;

/**
 * The only permitted adapter port is evidence intake from a human observer.
 * Implementations must not open, control, or automate a browser or desktop.
 */
export interface HumanBrowserEvidencePort {
  readRedactedEvidence(request: BrowserObservationRequest): Promise<BrowserObservationEvidence>;
}

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
