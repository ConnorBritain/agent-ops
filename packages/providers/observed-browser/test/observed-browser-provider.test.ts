import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runProviderConformance } from "@agent-ops/provider-sdk";
import {
  StaticHumanBrowserEvidencePort,
  buildBrowserObservationEvidence,
  buildBrowserObservationRequest,
  buildJobEnvelope,
  buildProviderInvocation,
  testIds,
} from "@agent-ops/test-kit";
import type { ProviderOperation } from "@agent-ops/contracts";
import { ObservedBrowserProvider } from "../src/index.ts";

const browserInvocation = (
  input: Record<string, unknown> = {},
  operation: ProviderOperation = "start",
) => buildProviderInvocation({
  operation,
  envelope: buildJobEnvelope({ requiredCapabilities: ["browser:observe"] }),
  input: { browserRequest: buildBrowserObservationRequest(), ...input },
});

describe("ObservedBrowserProvider", () => {
  it("declares a human-observed, no-execution capability and completes conformance with only static evidence", async () => {
    const evidence = new StaticHumanBrowserEvidencePort(buildBrowserObservationEvidence());
    const provider = new ObservedBrowserProvider(evidence);
    const result = await runProviderConformance(provider, {
      invocation: browserInvocation(),
      ingestedAt: "2026-07-30T04:00:02Z",
    });

    assert.equal(result.manifest.executionMode, "no-execution");
    assert.deepEqual(result.manifest.browser, {
      maturity: "human-observed",
      automation: "none",
      autonomousDesktopControl: false,
      supportedControls: ["observe", "request-human-confirmation"],
    });
    assert.equal(evidence.requests.length, 1);
    assert.equal(result.observations[0]?.state, "attention");
    assert.equal(result.artifacts[0]?.kind, "redacted-browser-observation");
    assert.doesNotMatch(JSON.stringify(result), /Human observer recorded a generic read-only status summary/);
  });

  it("refuses an undeclared domain before requesting any human evidence", async () => {
    const evidence = new StaticHumanBrowserEvidencePort(buildBrowserObservationEvidence());
    const provider = new ObservedBrowserProvider(evidence);
    const request = buildBrowserObservationRequest({
      targetDomain: "other.example.test",
      allowedDomains: ["console.example.test"],
    });
    const verdict = await provider.validateEnvironment(browserInvocation(
      { browserRequest: request },
      "validate-environment",
    ));
    assert.equal(verdict.accepted, false);
    assert.deepEqual(verdict.reasons, ["target-domain-not-allowed"]);
    const observation = await provider.start(browserInvocation({ browserRequest: request }));
    assert.equal(observation.state, "failed");
    assert.equal(evidence.requests.length, 0);
  });

  it("records a matching human write confirmation without executing a browser action", async () => {
    const request = buildBrowserObservationRequest({
      requestedAction: "propose-write",
      writeAuthority: "human-confirmed-write",
    });
    const evidence = new StaticHumanBrowserEvidencePort(buildBrowserObservationEvidence({
      classification: "write-intent-presented",
    }));
    const provider = new ObservedBrowserProvider(evidence);
    const start = await provider.start(browserInvocation({ browserRequest: request }));
    assert.equal(start.state, "attention");
    const confirmation = {
      version: "1.0",
      confirmationId: "00000000-0000-4000-8000-000000000139",
      requestId: request.requestId,
      actor: { id: testIds.principal, kind: "human", securityDomain: "example-domain" },
      securityDomain: "example-domain",
      targetDomain: "console.example.test",
      writeAuthority: "human-confirmed-write",
      decision: "approved",
      occurredAt: "2026-07-30T04:00:02Z",
    } as const;
    const confirmed = await provider.sendInput(browserInvocation({
      browserRequest: request,
      humanConfirmation: confirmation,
    }, "send-input"));
    assert.equal(confirmed.state, "attention");
    assert.equal(confirmed.detail["execution"], "not-executed");
    assert.equal(confirmed.detail["outcome"], "human-confirmation-recorded");
  });
});
