import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IndependentEstimatorAdapter,
  PortablePrimitiveCatalogAdapter,
  SkillsEstimationFinopsService,
} from "../src/index.ts";
import {
  InMemoryFinOpsLedger,
  StaticIndependentEstimatorTransport,
  StaticPrimitiveBundleTransport,
  testIds,
} from "@agent-ops/test-kit";
import {
  CONTRACT_VERSION,
  type AllocationRecord,
  type EffortMeasurement,
  type EstimateRecord,
  type PlanningFeedback,
  type PrimitiveBundleManifest,
  type RateCard,
} from "@agent-ops/contracts";

const bundle: PrimitiveBundleManifest = {
  version: CONTRACT_VERSION,
  bundleId: "core-primitives",
  bundleVersion: "1.2.0",
  sourceRef: "bundle://fixture/core-primitives",
  publishedAt: "2026-07-30T04:00:00Z",
  primitives: [{
    key: "repository-inspection",
    version: "1.2.0",
    purpose: "Inspect declared repository metadata and emit a redacted operational summary.",
    capabilities: ["git", "terminal"],
    securityDomains: ["example-domain"],
    access: { reads: ["repository-metadata", "task-ledger"], writes: ["attention-item"] },
    outputContract: { kind: "primitive-report", redaction: "required", maximumRecords: 1 },
    enforcement: [{ harness: "generic", level: "enforced", mechanism: "deterministic-code" }],
  }],
};

const estimate: EstimateRecord = {
  version: CONTRACT_VERSION,
  id: testIds.estimate,
  taskId: testIds.task,
  runId: testIds.run,
  securityDomain: "example-domain",
  estimator: { id: "independent-estimator", version: "1.0.0", model: "calibrated-range" },
  basis: {
    calibrationVersion: "1.3.0",
    evidenceRefs: ["evidence://fixture/calibration/quarterly", "evidence://fixture/task/context"],
  },
  agentRounds: { low: 1, expected: 2, high: 4 },
  wallClockSeconds: { low: 60, expected: 180, high: 360 },
  estimatedAt: "2026-07-30T04:00:00Z",
};

const effort: EffortMeasurement[] = [
  {
    version: CONTRACT_VERSION, id: testIds.effortAgent, taskId: testIds.task, runId: testIds.run,
    securityDomain: "example-domain", measure: "agent-execution", durationSeconds: 120,
    source: { kind: "worker", id: "worker-observation" }, occurredAt: "2026-07-30T04:01:00Z",
  },
  {
    version: CONTRACT_VERSION, id: testIds.effortHuman, taskId: testIds.task, runId: testIds.run,
    securityDomain: "example-domain", measure: "human-attention", durationSeconds: 30,
    source: { kind: "human", id: "attention-record" }, occurredAt: "2026-07-30T04:01:00Z",
  },
  {
    version: CONTRACT_VERSION, id: testIds.effortBlocked, taskId: testIds.task, runId: testIds.run,
    securityDomain: "example-domain", measure: "blocked", durationSeconds: 45,
    source: { kind: "coordinator", id: "policy-observation" }, occurredAt: "2026-07-30T04:01:00Z",
  },
  {
    version: CONTRACT_VERSION, id: testIds.effortVerification, taskId: testIds.task, runId: testIds.run,
    securityDomain: "example-domain", measure: "verification", durationSeconds: 60,
    source: { kind: "verifier", id: "verification-record" }, occurredAt: "2026-07-30T04:01:00Z",
  },
];

const rateCard: RateCard = {
  version: CONTRACT_VERSION,
  id: testIds.rateCard,
  rateCardVersion: "2.0.0",
  sourceRef: "rate-card://fixture/2026-q3",
  entries: [
    { key: "agent-second", unit: "second", amount: 0.01, currency: "USD" },
    { key: "shared-pool", unit: "run", amount: 0.5, currency: "USD" },
    { key: "human-second", unit: "second", amount: 0.02, currency: "USD" },
    { key: "failure-adjustment", unit: "run", amount: 0.1, currency: "USD" },
  ],
  effectiveAt: "2026-07-01T00:00:00Z",
};

const allocation = (
  id: string,
  category: "direct" | "fully-loaded" | "human-inclusive" | "failure-adjusted",
  allocationMethod: "direct-usage" | "fixed-pool" | "human-time" | "failure-adjustment",
  rateKey: string,
  quantity: number,
  unit: string,
  amount: number,
): AllocationRecord => ({
  version: CONTRACT_VERSION,
  id,
  taskId: testIds.task,
  runId: testIds.run,
  securityDomain: "example-domain",
  category,
  allocationMethod,
  rateCardId: testIds.rateCard,
  rateCardVersion: "2.0.0",
  rateKey,
  quantity,
  unit,
  amount,
  currency: "USD",
  accountingSystemOfRecord: "external" as const,
  allocatedAt: "2026-07-30T04:02:00Z",
});

const allocations: AllocationRecord[] = [
  allocation(testIds.allocationDirect, "direct", "direct-usage", "agent-second", 120, "second", 1.2),
  allocation(testIds.allocationFixed, "fully-loaded", "fixed-pool", "shared-pool", 1, "run", 0.5),
  allocation(testIds.allocationHuman, "human-inclusive", "human-time", "human-second", 30, "second", 0.6),
  allocation(testIds.allocationFailure, "failure-adjusted", "failure-adjustment", "failure-adjustment", 1, "run", 0.1),
];

const planningFeedback: PlanningFeedback = {
  version: CONTRACT_VERSION,
  id: testIds.planningFeedback,
  taskId: testIds.task,
  runId: testIds.run,
  securityDomain: "example-domain",
  planningRecordRef: "planning://fixture/record/1",
  relativePoints: 3,
  estimateId: testIds.estimate,
  effortMeasurementIds: effort.map((entry) => entry.id),
  allocationIds: allocations.map((entry) => entry.id),
  outcomeVerdict: "pass",
  recordedAt: "2026-07-30T04:03:00Z",
};

const fixture = () => {
  const bundleTransport = new StaticPrimitiveBundleTransport(bundle);
  const estimatorTransport = new StaticIndependentEstimatorTransport(estimate);
  const primitiveCatalog = new PortablePrimitiveCatalogAdapter(bundleTransport);
  const estimator = new IndependentEstimatorAdapter(estimatorTransport);
  const ledger = new InMemoryFinOpsLedger();
  const service = new SkillsEstimationFinopsService({ primitiveCatalog, estimator, ledger });
  return { bundleTransport, estimatorTransport, primitiveCatalog, estimator, ledger, service };
};

describe("portable skills, estimation, and FinOps lineage", () => {
  it("composes a portable primitive and independent estimate into distinct durable measures", async () => {
    const { bundleTransport, estimatorTransport, ledger, service } = fixture();
    const result = await service.record({
      bundleRef: "bundle://fixture/core-primitives",
      requiredSkills: [{ key: "repository-inspection", versionRange: "^1", enforcement: "enforced" }],
      estimateRequest: {
        taskId: testIds.task,
        runId: testIds.run,
        securityDomain: "example-domain",
        evidenceRefs: ["evidence://fixture/task/context"],
        requestedAt: "2026-07-30T04:00:00Z",
      },
      effort,
      rateCards: [rateCard],
      allocations,
      planningFeedback,
    });

    assert.equal(result.requiredPrimitives[0]?.key, "repository-inspection");
    assert.equal(result.estimate.estimator.model, "calibrated-range");
    assert.deepEqual(bundleTransport.calls, ["bundle://fixture/core-primitives"]);
    assert.equal(estimatorTransport.calls.length, 1);
    assert.deepEqual(ledger.operations, [
      "estimate",
      "effort:agent-execution",
      "effort:human-attention",
      "effort:blocked",
      "effort:verification",
      "rate-card",
      "allocation:direct",
      "allocation:fully-loaded",
      "allocation:human-inclusive",
      "allocation:failure-adjusted",
      "planning-feedback",
    ]);
    assert.equal(ledger.planningFeedback[0]?.relativePoints, 3);
    assert.equal(JSON.stringify(ledger.planningFeedback).includes("USD"), false);
  });

  it("refuses an absent enforced primitive and relay content containing inline secret-like material", async () => {
    const { primitiveCatalog, service, ledger } = fixture();
    await assert.rejects(() => service.record({
      bundleRef: "bundle://fixture/core-primitives",
      requiredSkills: [{ key: "missing-primitive", versionRange: "^1", enforcement: "enforced" }],
      estimateRequest: {
        taskId: testIds.task,
        runId: testIds.run,
        securityDomain: "example-domain",
        evidenceRefs: ["evidence://fixture/task/context"],
        requestedAt: "2026-07-30T04:00:00Z",
      },
      effort,
      rateCards: [rateCard],
      allocations,
      planningFeedback,
    }), /absent/);
    assert.deepEqual(ledger.operations, []);
    assert.deepEqual(
      primitiveCatalog.redactOperationalDetail({
        primitiveKey: "repository-inspection",
        state: "attention-required",
        summary: "Operator approval is needed for the bounded fixture.",
        attentionRef: "attention://fixture/1",
      }),
      {
        primitiveKey: "repository-inspection",
        state: "attention-required",
        summary: "Operator approval is needed for the bounded fixture.",
        attentionRef: "attention://fixture/1",
        redaction: "verified-no-inline-secret",
      },
    );
    assert.throws(
      () => primitiveCatalog.redactOperationalDetail({
        primitiveKey: "repository-inspection",
        state: "blocked",
        summary: "unsafe fixture",
        apiKey: "inline-value",
      } as never),
      /secret/i,
    );
  });
});
