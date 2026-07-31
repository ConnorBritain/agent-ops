import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONTRACT_VERSION, type ProviderCapabilityManifest } from "@agent-ops/contracts";
import { normalizeProviderObservation, routeProvider } from "../src/index.ts";

const manifest = (providerId: string, capabilities: readonly string[]): ProviderCapabilityManifest => ({
  version: CONTRACT_VERSION,
  providerId,
  providerVersion: "0.1.0",
  executionMode: "no-execution",
  capabilities: [...capabilities],
  lifecycle: [
    "validate-environment", "start", "send-input", "inspect", "pause", "resume", "cancel", "collect-artifacts",
  ].map((operation) => ({ operation: operation as ProviderCapabilityManifest["lifecycle"][number]["operation"], support: "supported" })),
});

describe("provider SDK", () => {
  it("routes by declared capability without requiring a provider name", () => {
    const route = routeProvider({ requiredCapabilities: ["terminal"] }, [
      { manifest: manifest("slower-provider", ["terminal"]), preferenceScore: 1 },
      { manifest: manifest("faster-provider", ["terminal"]), preferenceScore: 2 },
    ]);
    assert.equal(route.accepted, true);
    if (route.accepted) assert.equal(route.provider.manifest.providerId, "faster-provider");

    const preferred = routeProvider({
      requiredCapabilities: ["terminal"],
      providerPreference: "slower-provider",
    }, [
      { manifest: manifest("slower-provider", ["terminal"]), preferenceScore: 1 },
      { manifest: manifest("faster-provider", ["terminal"]), preferenceScore: 2 },
    ]);
    assert.equal(preferred.accepted, true);
    if (preferred.accepted) assert.equal(preferred.provider.manifest.providerId, "slower-provider");

    const unavailable = routeProvider({ requiredCapabilities: ["browser"] }, [
      { manifest: manifest("terminal-provider", ["terminal"]), preferenceScore: 99 },
    ]);
    assert.deepEqual(unavailable, {
      accepted: false,
      reason: "no-capable-provider",
      exclusions: [{ providerId: "terminal-provider", reason: "missing-capabilities:browser" }],
    });
  });

  it("normalizes a correlated provider observation before it can affect a run", () => {
    const invocation = {
      version: CONTRACT_VERSION,
      invocationId: "00000000-0000-4000-8000-000000000401",
      operation: "start" as const,
      envelope: {
        version: CONTRACT_VERSION,
        jobId: "00000000-0000-4000-8000-000000000402",
        taskId: "00000000-0000-4000-8000-000000000403",
        runId: "00000000-0000-4000-8000-000000000404",
        securityDomain: "example-domain",
        requiredCapabilities: ["terminal"],
        requiredSkills: [],
        policyDecisionId: "00000000-0000-4000-8000-000000000405",
        lease: { leaseName: "provider-job", holderId: "00000000-0000-4000-8000-000000000406", fencingToken: 1, expiresAt: "2026-07-30T05:00:00Z" },
        safeWorkingDirectory: "/workspace/example",
        redactionPolicyRef: "policy://redaction/default",
        callbackIdentityRef: "secret://agentops/callback/provider",
        body: { objective: "deterministic fixture" },
        signature: { algorithm: "ed25519" as const, keyRef: "secret://agentops/signing/coordinator", value: "a".repeat(64) },
      },
      input: {},
      requestedAt: "2026-07-30T04:00:00Z",
    };
    const event = normalizeProviderObservation(invocation, {
      version: CONTRACT_VERSION,
      providerId: "print-provider",
      invocationId: invocation.invocationId,
      operation: "start",
      observedAt: "2026-07-30T04:00:01Z",
      state: "pending",
      sourceEventId: "print:401:start",
      detail: { execution: "not-started" },
    }, "2026-07-30T04:00:02Z");
    assert.equal(event.type, "provider.observation");
    assert.equal(event.runId, invocation.envelope.runId);
    assert.throws(
      () => normalizeProviderObservation(invocation, {
        version: CONTRACT_VERSION,
        providerId: "print-provider",
        invocationId: invocation.invocationId,
        operation: "cancel",
        observedAt: "2026-07-30T04:00:01Z",
        state: "pending",
        sourceEventId: "print:401:cancel",
        detail: { execution: "not-started" },
      }, "2026-07-30T04:00:02Z"),
      /operation does not match/,
    );
  });
});
