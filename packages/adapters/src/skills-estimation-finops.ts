import {
  assertNoInlineSecrets,
  assertPortablePrimitiveBundle,
  estimateRecordSchema,
  type EffortMeasurement,
  type EstimateRecord,
  type PlanningFeedback,
  type PortablePrimitive,
  type PrimitiveBundleManifest,
  type RateCard,
  type AllocationRecord,
  type SkillRequirement,
} from "@agent-ops/contracts";
import {
  assertFinOpsLineage,
  skillVersionSatisfies,
  type FinOpsLedgerStore,
} from "@agent-ops/domain";

/**
 * A separately-operated primitive registry is composed through this narrow
 * transport. It exposes a generic, already-materialized bundle only: no host
 * inventory, sessions, credentials, runtime process, or installation action.
 */
export interface PortablePrimitiveBundleTransport {
  load(input: { readonly bundleRef: string }): Promise<unknown>;
}

export type PrimitiveOperationalDetail = {
  readonly primitiveKey: string;
  readonly state: "ready" | "attention-required" | "blocked";
  readonly summary: string;
  readonly attentionRef?: string;
};

export type RedactedPrimitiveOperationalDetail = PrimitiveOperationalDetail & {
  readonly redaction: "verified-no-inline-secret";
};

/**
 * Validates a portable manifest supplied by another primitive system without
 * reimplementing that system. Its only local policy is deterministic contract
 * compatibility before a Coordinator may rely on an enforced primitive.
 */
export class PortablePrimitiveCatalogAdapter {
  readonly #transport: PortablePrimitiveBundleTransport;

  constructor(transport: PortablePrimitiveBundleTransport) {
    this.#transport = transport;
  }

  async load(bundleRef: string): Promise<PrimitiveBundleManifest> {
    const raw = await this.#transport.load({ bundleRef });
    assertNoInlineSecrets(raw);
    const bundle = assertPortablePrimitiveBundle(raw);
    if (bundle.sourceRef !== bundleRef) {
      throw new Error("Portable primitive bundle sourceRef must match the requested bundle reference.");
    }
    return bundle;
  }

  requireCompatiblePrimitives(
    bundle: PrimitiveBundleManifest,
    requiredSkills: readonly SkillRequirement[],
  ): readonly PortablePrimitive[] {
    const selected: PortablePrimitive[] = [];
    for (const required of requiredSkills) {
      if (required.enforcement !== "enforced") continue;
      const primitive = bundle.primitives.find((candidate) => candidate.key === required.key);
      if (!primitive) {
        throw new Error(`Required enforced primitive is absent from the portable bundle: ${required.key}.`);
      }
      if (!skillVersionSatisfies(primitive.version, required.versionRange)) {
        throw new Error(`Required enforced primitive is incompatible with the portable bundle: ${required.key}.`);
      }
      const enforcement = primitive.enforcement.some(
        (entry) => entry.level === "enforced" && entry.mechanism === "deterministic-code",
      );
      if (!enforcement) {
        throw new Error(`Required primitive lacks deterministic enforced coverage: ${required.key}.`);
      }
      selected.push(primitive);
    }
    return selected;
  }

  /**
   * Operational summaries remain useful for attention routing, but are
   * rejected before relay if they contain an inline secret-like value. This is
   * a report transformation, never an authentication or authorization action.
   */
  redactOperationalDetail(input: PrimitiveOperationalDetail): RedactedPrimitiveOperationalDetail {
    assertNoInlineSecrets(input);
    return { ...input, redaction: "verified-no-inline-secret" };
  }
}

/** A separately versioned estimator is composed only through this contract. */
export interface IndependentEstimatorTransport {
  estimate(input: IndependentEstimateRequest): Promise<unknown>;
}

export type IndependentEstimateRequest = {
  readonly taskId: string;
  readonly runId: string;
  readonly securityDomain: string;
  readonly evidenceRefs: readonly string[];
  readonly requestedAt: string;
};

/**
 * Validates an independent model's range/calibration output. It deliberately
 * does not calculate estimates, own calibration history, or translate
 * relative planning points into currency.
 */
export class IndependentEstimatorAdapter {
  readonly #transport: IndependentEstimatorTransport;

  constructor(transport: IndependentEstimatorTransport) {
    this.#transport = transport;
  }

  async estimate(input: IndependentEstimateRequest): Promise<EstimateRecord> {
    assertNoInlineSecrets(input);
    const raw = await this.#transport.estimate(input);
    assertNoInlineSecrets(raw);
    const estimate = estimateRecordSchema.parse(raw);
    if (
      estimate.taskId !== input.taskId
      || estimate.runId !== input.runId
      || estimate.securityDomain !== input.securityDomain
    ) {
      throw new Error("Independent estimate must retain the requested task, run, and security domain.");
    }
    const evidence = new Set(estimate.basis.evidenceRefs);
    if (!input.evidenceRefs.every((reference) => evidence.has(reference))) {
      throw new Error("Independent estimate must retain every request evidence reference in its basis.");
    }
    return estimate;
  }
}

export type SkillsEstimationFinopsPorts = {
  readonly primitiveCatalog: PortablePrimitiveCatalogAdapter;
  readonly estimator: IndependentEstimatorAdapter;
  readonly ledger: FinOpsLedgerStore;
};

export type RecordSkillsEstimationFinopsInput = {
  readonly bundleRef: string;
  readonly requiredSkills: readonly SkillRequirement[];
  readonly estimateRequest: IndependentEstimateRequest;
  readonly effort: readonly EffortMeasurement[];
  readonly rateCards: readonly RateCard[];
  readonly allocations: readonly AllocationRecord[];
  readonly planningFeedback: PlanningFeedback;
};

/**
 * Source-only orchestration for portable skill selection and FinOps lineage.
 * It persists independently supplied facts in a caller-owned ledger; there is
 * no background loop, billing call, installation command, or host mutation.
 */
export class SkillsEstimationFinopsService {
  readonly #ports: SkillsEstimationFinopsPorts;

  constructor(ports: SkillsEstimationFinopsPorts) {
    this.#ports = ports;
  }

  async record(input: RecordSkillsEstimationFinopsInput): Promise<{
    readonly bundle: PrimitiveBundleManifest;
    readonly requiredPrimitives: readonly PortablePrimitive[];
    readonly estimate: EstimateRecord;
  }> {
    assertNoInlineSecrets(input);
    const bundle = await this.#ports.primitiveCatalog.load(input.bundleRef);
    const requiredPrimitives = this.#ports.primitiveCatalog.requireCompatiblePrimitives(
      bundle,
      input.requiredSkills,
    );
    const estimate = await this.#ports.estimator.estimate(input.estimateRequest);
    assertFinOpsLineage({
      estimate,
      effort: input.effort,
      rateCards: input.rateCards,
      allocations: input.allocations,
      planningFeedback: input.planningFeedback,
    });

    await this.#ports.ledger.recordEstimate(estimate);
    for (const measurement of input.effort) await this.#ports.ledger.recordEffort(measurement);
    for (const rateCard of input.rateCards) await this.#ports.ledger.recordRateCard(rateCard);
    for (const allocation of input.allocations) await this.#ports.ledger.recordAllocation(allocation);
    await this.#ports.ledger.recordPlanningFeedback(input.planningFeedback);
    return { bundle, requiredPrimitives, estimate };
  }
}
