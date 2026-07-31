import { createHash } from "node:crypto";
import {
  CONTRACT_VERSION,
  providerInvocationSchema,
  type Provider,
  type ProviderArtifact,
  type ProviderCapabilityManifest,
  type ProviderEnvironmentVerdict,
  type ProviderInvocation,
  type ProviderObservation,
  type ProviderOperation,
} from "@agent-ops/contracts";

export type PrintedPlan = {
  readonly version: typeof CONTRACT_VERSION;
  readonly planId: string;
  readonly providerId: "print-provider";
  readonly providerVersion: "0.1.0";
  readonly operation: ProviderOperation;
  readonly invocationId: string;
  readonly jobId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly securityDomain: string;
  readonly requiredCapabilities: readonly string[];
  readonly requiredSkills: readonly { readonly key: string; readonly versionRange: string }[];
  readonly safeWorkingDirectory: string;
  readonly resourceBudget: Readonly<Record<string, unknown>> | null;
  /** Identifies the full sealed envelope without rendering body, callback, or signature material. */
  readonly envelopeDigest: string;
  readonly execution: "not-started";
};

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

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Readonly<Record<string, unknown>>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
};

const digest = (value: unknown): string =>
  `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;

const planFor = (input: ProviderInvocation): PrintedPlan => {
  const invocation = providerInvocationSchema.parse(input);
  const { envelope } = invocation;
  return {
    version: CONTRACT_VERSION,
    planId: `print:${invocation.invocationId}:${invocation.operation}`,
    providerId: "print-provider",
    providerVersion: "0.1.0",
    operation: invocation.operation,
    invocationId: invocation.invocationId,
    jobId: envelope.jobId,
    taskId: envelope.taskId,
    runId: envelope.runId,
    securityDomain: envelope.securityDomain,
    requiredCapabilities: [...envelope.requiredCapabilities],
    requiredSkills: envelope.requiredSkills.map((skill) => ({ ...skill })),
    safeWorkingDirectory: envelope.safeWorkingDirectory,
    resourceBudget: envelope.resourceBudget ? { ...envelope.resourceBudget } : null,
    envelopeDigest: digest(envelope),
    execution: "not-started",
  };
};

const expectedOperation = (
  input: ProviderInvocation,
  operation: ProviderOperation,
): ProviderInvocation => {
  const invocation = providerInvocationSchema.parse(input);
  if (invocation.operation !== operation) {
    throw new Error(`PrintProvider expected ${operation}, received ${invocation.operation}.`);
  }
  return invocation;
};

export class PrintProvider implements Provider {
  readonly plans: PrintedPlan[] = [];

  async inspectCapabilities(): Promise<ProviderCapabilityManifest> {
    return {
      version: CONTRACT_VERSION,
      providerId: "print-provider",
      providerVersion: "0.1.0",
      executionMode: "no-execution",
      capabilities: ["terminal", "git"],
      lifecycle: lifecycle.map((operation) => ({ operation, support: "supported" })),
    };
  }

  #record(input: ProviderInvocation): PrintedPlan {
    const plan = planFor(input);
    this.plans.push(plan);
    return plan;
  }

  #observation(input: ProviderInvocation, operation: ProviderOperation): ProviderObservation {
    const invocation = expectedOperation(input, operation);
    const plan = this.#record(invocation);
    return {
      version: CONTRACT_VERSION,
      providerId: "print-provider",
      invocationId: invocation.invocationId,
      operation,
      observedAt: invocation.requestedAt,
      state: "pending",
      sourceEventId: plan.planId,
      detail: {
        execution: plan.execution,
        planId: plan.planId,
        envelopeDigest: plan.envelopeDigest,
      },
    };
  }

  async validateEnvironment(input: ProviderInvocation): Promise<ProviderEnvironmentVerdict> {
    const invocation = expectedOperation(input, "validate-environment");
    const plan = this.#record(invocation);
    const manifest = await this.inspectCapabilities();
    const available = new Set(manifest.capabilities);
    const missing = invocation.envelope.requiredCapabilities.filter((capability) => !available.has(capability));
    return {
      version: CONTRACT_VERSION,
      providerId: "print-provider",
      invocationId: invocation.invocationId,
      accepted: missing.length === 0,
      reasons: missing.map((capability) => `missing-capability:${capability}`),
      detail: {
        execution: plan.execution,
        planId: plan.planId,
        envelopeDigest: plan.envelopeDigest,
      },
    };
  }

  async start(input: ProviderInvocation): Promise<ProviderObservation> {
    return this.#observation(input, "start");
  }

  async sendInput(input: ProviderInvocation): Promise<ProviderObservation> {
    return this.#observation(input, "send-input");
  }

  async inspect(input: ProviderInvocation): Promise<ProviderObservation> {
    return this.#observation(input, "inspect");
  }

  async pause(input: ProviderInvocation): Promise<ProviderObservation> {
    return this.#observation(input, "pause");
  }

  async resume(input: ProviderInvocation): Promise<ProviderObservation> {
    return this.#observation(input, "resume");
  }

  async cancel(input: ProviderInvocation): Promise<ProviderObservation> {
    return this.#observation(input, "cancel");
  }

  async collectArtifacts(input: ProviderInvocation): Promise<readonly ProviderArtifact[]> {
    const invocation = expectedOperation(input, "collect-artifacts");
    const plan = this.#record(invocation);
    return [{
      version: CONTRACT_VERSION,
      providerId: "print-provider",
      invocationId: invocation.invocationId,
      kind: "provider-plan",
      mediaType: "application/json",
      data: {
        plan,
      },
    }];
  }
}
