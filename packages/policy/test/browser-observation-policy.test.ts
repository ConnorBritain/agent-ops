import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONTRACT_VERSION,
  type BrowserObservationRequest,
  type ProviderCapabilityManifest,
} from "@agent-ops/contracts";
import {
  evaluateBrowserHumanConfirmation,
  evaluateBrowserObservationPolicy,
} from "../src/index.ts";

const request = (
  overrides: Partial<BrowserObservationRequest> = {},
): BrowserObservationRequest => ({
  version: CONTRACT_VERSION,
  requestId: "00000000-0000-4000-8000-000000000138",
  taskId: "00000000-0000-4000-8000-000000000106",
  runId: "00000000-0000-4000-8000-000000000107",
  securityDomain: "example-domain",
  targetDomain: "console.example.test",
  allowedDomains: ["console.example.test"],
  requestedAction: "observe",
  writeAuthority: "observe-only",
  humanConfirmationRequired: true,
  redactionPolicyRef: "policy://redaction/default",
  requestedAt: "2026-07-30T04:00:00Z",
  ...overrides,
});

const providerOperations = [
  "validate-environment", "start", "send-input", "inspect", "pause", "resume", "cancel", "collect-artifacts",
] as const;

const manifest = (): ProviderCapabilityManifest => ({
  version: CONTRACT_VERSION,
  providerId: "observed-browser",
  providerVersion: "0.1.0",
  executionMode: "no-execution",
  capabilities: ["browser:observe", "browser:human-confirmation"],
  browser: {
    maturity: "human-observed",
    automation: "none",
    autonomousDesktopControl: false,
    supportedControls: ["observe", "request-human-confirmation"],
  },
  lifecycle: providerOperations.map((operation) => ({ operation, support: "supported" })),
});

describe("browser observation policy", () => {
  it("allows only human observation of an exact declared domain", () => {
    assert.deepEqual(evaluateBrowserObservationPolicy({
      manifest: manifest(),
      request: request(),
    }), {
      decision: "allow-human-observation",
      reason: "human-observation-required",
      execution: "not-executed",
    });
    assert.equal(evaluateBrowserObservationPolicy({
      manifest: manifest(),
      request: request({ targetDomain: "other.example.test" }),
    }).reason, "target-domain-not-allowed");
  });

  it("blocks write intent without authority and requires a human confirmation when authority is declared", () => {
    assert.equal(evaluateBrowserObservationPolicy({
      manifest: manifest(),
      request: request({ requestedAction: "propose-write" }),
    }).reason, "write-authority-observe-only");
    assert.deepEqual(evaluateBrowserObservationPolicy({
      manifest: manifest(),
      request: request({
        requestedAction: "propose-write",
        writeAuthority: "human-confirmed-write",
      }),
    }), {
      decision: "require-human-confirmation",
      reason: "human-confirmation-required",
      execution: "not-executed",
    });
  });

  it("records only a matching human confirmation and never turns it into execution", () => {
    const browserRequest = request({
      requestedAction: "propose-write",
      writeAuthority: "human-confirmed-write",
    });
    assert.deepEqual(evaluateBrowserHumanConfirmation({
      request: browserRequest,
      confirmation: {
        version: CONTRACT_VERSION,
        confirmationId: "00000000-0000-4000-8000-000000000139",
        requestId: browserRequest.requestId,
        actor: { id: "00000000-0000-4000-8000-000000000102", kind: "human", securityDomain: "example-domain" },
        securityDomain: "example-domain",
        targetDomain: browserRequest.targetDomain,
        writeAuthority: "human-confirmed-write",
        decision: "approved",
        occurredAt: "2026-07-30T04:00:02Z",
      },
    }), {
      decision: "recorded",
      reason: "human-confirmation-recorded",
      execution: "not-executed",
    });
    assert.equal(evaluateBrowserHumanConfirmation({
      request: browserRequest,
      confirmation: {
        version: CONTRACT_VERSION,
        confirmationId: "00000000-0000-4000-8000-000000000139",
        requestId: "00000000-0000-4000-8000-000000000140",
        actor: { id: "00000000-0000-4000-8000-000000000102", kind: "human", securityDomain: "example-domain" },
        securityDomain: "example-domain",
        targetDomain: browserRequest.targetDomain,
        writeAuthority: "human-confirmed-write",
        decision: "approved",
        occurredAt: "2026-07-30T04:00:02Z",
      },
    }).reason, "confirmation-request-mismatch");
  });
});
