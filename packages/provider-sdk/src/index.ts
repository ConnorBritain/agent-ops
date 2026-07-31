import {
  CONTRACT_VERSION,
  PROVIDER_OPERATIONS,
  normalizedEventSchema,
  providerArtifactSchema,
  providerCapabilityManifestSchema,
  providerEnvironmentVerdictSchema,
  providerInvocationSchema,
  providerObservationSchema,
  type NormalizedEvent,
  type Provider,
  type ProviderArtifact,
  type ProviderCapabilityManifest,
  type ProviderInvocation,
  type ProviderObservation,
  type ProviderOperation,
} from "@agent-ops/contracts";

export type ProviderRouteCandidate = {
  readonly manifest: ProviderCapabilityManifest;
  readonly preferenceScore: number;
};

export type ProviderRouteRequest = {
  readonly requiredCapabilities: readonly string[];
  readonly providerPreference?: string;
};

export type ProviderRouteResult =
  | {
    readonly accepted: true;
    readonly provider: ProviderRouteCandidate;
    readonly exclusions: readonly { readonly providerId: string; readonly reason: string }[];
  }
  | {
    readonly accepted: false;
    readonly reason: "no-capable-provider";
    readonly exclusions: readonly { readonly providerId: string; readonly reason: string }[];
  };

export function routeProvider(
  request: ProviderRouteRequest,
  candidates: readonly ProviderRouteCandidate[],
): ProviderRouteResult {
  const exclusions: { providerId: string; reason: string }[] = [];
  const eligible = candidates.filter((candidate) => {
    const capabilities = new Set(candidate.manifest.capabilities);
    const missing = request.requiredCapabilities.filter((capability) => !capabilities.has(capability));
    if (!missing.length) return true;
    exclusions.push({
      providerId: candidate.manifest.providerId,
      reason: `missing-capabilities:${[...missing].sort().join(",")}`,
    });
    return false;
  });
  const selected = [...eligible].sort((left, right) => {
    const leftPreferred = left.manifest.providerId === request.providerPreference ? 1 : 0;
    const rightPreferred = right.manifest.providerId === request.providerPreference ? 1 : 0;
    return rightPreferred - leftPreferred
      || right.preferenceScore - left.preferenceScore
      || left.manifest.providerId.localeCompare(right.manifest.providerId);
  })[0];
  return selected
    ? { accepted: true, provider: selected, exclusions }
    : { accepted: false, reason: "no-capable-provider", exclusions };
}

export function normalizeProviderObservation(
  invocationInput: ProviderInvocation,
  observationInput: ProviderObservation,
  ingestedAt: string,
): NormalizedEvent {
  const invocation = providerInvocationSchema.parse(invocationInput);
  const observation = providerObservationSchema.parse(observationInput);
  if (observation.invocationId !== invocation.invocationId) {
    throw new Error("Provider observation invocation does not match the requested operation.");
  }
  if (observation.operation !== invocation.operation) {
    throw new Error("Provider observation operation does not match the requested operation.");
  }
  return normalizedEventSchema.parse({
    version: CONTRACT_VERSION,
    type: "provider.observation",
    entity: { type: "run", id: invocation.envelope.runId },
    source: { kind: "provider", id: observation.providerId },
    sourceEventId: observation.sourceEventId,
    securityDomain: invocation.envelope.securityDomain,
    taskId: invocation.envelope.taskId,
    runId: invocation.envelope.runId,
    occurredAt: observation.observedAt,
    ingestedAt,
    payload: {
      invocationId: observation.invocationId,
      operation: observation.operation,
      state: observation.state,
      detail: observation.detail,
    },
  });
}

export type ProviderConformanceFixture = {
  readonly invocation: ProviderInvocation;
  readonly ingestedAt: string;
};

export type ProviderConformanceResult = {
  readonly manifest: ProviderCapabilityManifest;
  readonly observations: readonly ProviderObservation[];
  readonly normalizedEvents: readonly NormalizedEvent[];
  readonly artifacts: readonly ProviderArtifact[];
};

const invocationFor = (input: ProviderInvocation, operation: ProviderOperation): ProviderInvocation =>
  providerInvocationSchema.parse({ ...input, operation });

const declarationFor = (
  manifest: ProviderCapabilityManifest,
  operation: ProviderOperation,
) => manifest.lifecycle.find((entry) => entry.operation === operation);

const assertObservation = (
  manifest: ProviderCapabilityManifest,
  invocation: ProviderInvocation,
  observation: ProviderObservation,
): ProviderObservation => {
  const parsed = providerObservationSchema.parse(observation);
  if (parsed.providerId !== manifest.providerId) {
    throw new Error("Provider observation reported a different provider identity.");
  }
  if (parsed.invocationId !== invocation.invocationId || parsed.operation !== invocation.operation) {
    throw new Error("Provider observation did not preserve operation correlation.");
  }
  const declaration = declarationFor(manifest, invocation.operation);
  if (!declaration) throw new Error("Provider manifest omitted a lifecycle declaration.");
  if (declaration.support === "unsupported" && parsed.state !== "unknown") {
    throw new Error("An unsupported provider operation must produce an unknown observation.");
  }
  return parsed;
};

export async function runProviderConformance(
  provider: Provider,
  fixture: ProviderConformanceFixture,
): Promise<ProviderConformanceResult> {
  const base = providerInvocationSchema.parse(fixture.invocation);
  const manifest = providerCapabilityManifestSchema.parse(await provider.inspectCapabilities());
  const expectedCapabilities = new Set(base.envelope.requiredCapabilities);
  for (const capability of expectedCapabilities) {
    if (!manifest.capabilities.includes(capability)) {
      throw new Error(`Provider manifest is missing required capability: ${capability}`);
    }
  }

  const environmentInvocation = invocationFor(base, "validate-environment");
  const environment = providerEnvironmentVerdictSchema.parse(
    await provider.validateEnvironment(environmentInvocation),
  );
  if (environment.providerId !== manifest.providerId || environment.invocationId !== base.invocationId) {
    throw new Error("Provider environment verdict did not preserve operation correlation.");
  }
  if (!environment.accepted) throw new Error("Provider rejected the deterministic conformance environment.");

  const observations: ProviderObservation[] = [];
  const normalizedEvents: NormalizedEvent[] = [];
  for (const operation of PROVIDER_OPERATIONS) {
    if (operation === "validate-environment" || operation === "collect-artifacts") continue;
    const invocation = invocationFor(base, operation);
    const observation = operation === "start"
      ? await provider.start(invocation)
      : operation === "send-input"
        ? await provider.sendInput(invocation)
        : operation === "inspect"
          ? await provider.inspect(invocation)
          : operation === "pause"
            ? await provider.pause(invocation)
            : operation === "resume"
              ? await provider.resume(invocation)
              : await provider.cancel(invocation);
    const validated = assertObservation(manifest, invocation, observation);
    observations.push(validated);
    normalizedEvents.push(normalizeProviderObservation(invocation, validated, fixture.ingestedAt));
  }

  const artifactInvocation = invocationFor(base, "collect-artifacts");
  const artifacts = (await provider.collectArtifacts(artifactInvocation)).map((artifact) => {
    const parsed = providerArtifactSchema.parse(artifact);
    if (parsed.providerId !== manifest.providerId || parsed.invocationId !== base.invocationId) {
      throw new Error("Provider artifact did not preserve operation correlation.");
    }
    return parsed;
  });

  return { manifest, observations, normalizedEvents, artifacts };
}
