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

export type ProviderObservation = {
  readonly providerId: string;
  readonly observedAt: string;
  readonly state: "pending" | "starting" | "running" | "paused" | "attention" | "failed" | "cancelled" | "complete" | "unknown";
  readonly sourceEventId: string;
  readonly detail: Readonly<Record<string, unknown>>;
};

export interface Provider {
  inspectCapabilities(): Promise<readonly string[]>;
  validateEnvironment(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
  start(input: Readonly<Record<string, unknown>>): Promise<ProviderObservation>;
  sendInput(input: Readonly<Record<string, unknown>>): Promise<ProviderObservation>;
  inspect(input: Readonly<Record<string, unknown>>): Promise<ProviderObservation>;
  pause(input: Readonly<Record<string, unknown>>): Promise<ProviderObservation>;
  resume(input: Readonly<Record<string, unknown>>): Promise<ProviderObservation>;
  cancel(input: Readonly<Record<string, unknown>>): Promise<ProviderObservation>;
  collectArtifacts(input: Readonly<Record<string, unknown>>): Promise<readonly Readonly<Record<string, unknown>>[]>;
}
