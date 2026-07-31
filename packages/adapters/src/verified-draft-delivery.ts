import {
  assertNoInlineSecrets,
  draftPullRequestIntentSchema,
  verificationRecordSchema,
  type DraftPullRequestIntent,
  type VerificationRecord,
} from "@agent-ops/contracts";
import type { PolicyDecision } from "@agent-ops/domain";

export type DraftPullRequestReference = {
  readonly draft: true;
  readonly pullRequestRef: string;
};

export type VerifiedDraftDeliveryResult =
  | {
    readonly kind: "draft-created";
    readonly verification: VerificationRecord;
    readonly pullRequest: DraftPullRequestReference;
  }
  | {
    readonly kind: "blocked-verification";
    readonly verification: VerificationRecord;
  }
  | {
    readonly kind: "blocked-policy";
    readonly verification: VerificationRecord;
    readonly policyDecision: PolicyDecision;
  };

export type DraftDeliveryReservation =
  | { readonly state: "pending" }
  | { readonly state: "completed"; readonly result: VerifiedDraftDeliveryResult };

/**
 * This durable port keeps verification evidence, gate decisions, and delivery
 * completion separate. A concrete implementation must make the gateway's
 * idempotency key durable before any external projection is attempted.
 */
export interface DraftDeliveryStore {
  reserve(intent: DraftPullRequestIntent): Promise<DraftDeliveryReservation>;
  recordVerification(verification: VerificationRecord): Promise<void>;
  recordGate(input: {
    readonly deliveryId: string;
    readonly verificationId: string;
    readonly policyDecision?: PolicyDecision;
    readonly allowed: boolean;
    readonly recordedAt: string;
  }): Promise<void>;
  complete(input: {
    readonly deliveryId: string;
    readonly result: VerifiedDraftDeliveryResult;
    readonly completedAt: string;
  }): Promise<void>;
}

/** The verifier is an independent source of truth, never a provider output. */
export interface IndependentVerifier {
  verify(input: {
    readonly intent: DraftPullRequestIntent;
  }): Promise<VerificationRecord>;
}

/** A policy decision is required even after the independent verifier passes. */
export interface DraftDeliveryPolicy {
  evaluate(input: {
    readonly intent: DraftPullRequestIntent;
    readonly verification: VerificationRecord;
  }): Promise<PolicyDecision>;
}

/**
 * The future GitHub adapter implements only this draft-creation port. It must
 * enforce idempotency using `intent.idempotencyKey`; this public boundary has
 * no SDK, network, repository, branch, pull-request, merge, or release API.
 */
export interface DraftPullRequestGateway {
  createDraft(intent: DraftPullRequestIntent): Promise<DraftPullRequestReference>;
}

export interface DraftDeliveryClock {
  now(): string;
}

export type VerifiedDraftDeliveryPorts = {
  readonly clock: DraftDeliveryClock;
  readonly store: DraftDeliveryStore;
  readonly verifier: IndependentVerifier;
  readonly policy: DraftDeliveryPolicy;
  readonly gateway: DraftPullRequestGateway;
};

const assertGatewayReference = (value: DraftPullRequestReference): DraftPullRequestReference => {
  assertNoInlineSecrets(value);
  if (value.draft !== true || !/^draft-pr:\/\/[A-Za-z0-9._/-]{1,240}$/.test(value.pullRequestRef)) {
    throw new Error("Draft delivery gateway must return a safe draft pull-request reference.");
  }
  return value;
};

/**
 * A small application service for a verifiably gated draft. It does not create
 * a task, run, provider session, worker process, listener, or retry loop. A
 * gateway failure deliberately leaves the reservation pending, so a durable,
 * idempotent gateway can be retried by an authorized outbox later.
 */
export class VerifiedDraftDeliveryService {
  readonly #ports: VerifiedDraftDeliveryPorts;

  constructor(ports: VerifiedDraftDeliveryPorts) {
    this.#ports = ports;
  }

  async deliver(rawIntent: unknown): Promise<VerifiedDraftDeliveryResult> {
    const intent = draftPullRequestIntentSchema.parse(rawIntent);
    assertNoInlineSecrets(intent);
    const reservation = await this.#ports.store.reserve(intent);
    if (reservation.state === "completed") return reservation.result;

    const verification = verificationRecordSchema.parse(
      await this.#ports.verifier.verify({ intent }),
    );
    if (
      verification.id !== intent.verificationId
      || verification.taskId !== intent.taskId
      || verification.runId !== intent.runId
      || verification.securityDomain !== intent.securityDomain
    ) {
      throw new Error("Independent verification must match the draft delivery task, run, domain, and reference.");
    }
    await this.#ports.store.recordVerification(verification);

    if (verification.verdict !== "pass") {
      const result: VerifiedDraftDeliveryResult = {
        kind: "blocked-verification",
        verification,
      };
      await this.#ports.store.recordGate({
        deliveryId: intent.deliveryId,
        verificationId: verification.id,
        allowed: false,
        recordedAt: this.#ports.clock.now(),
      });
      await this.#ports.store.complete({
        deliveryId: intent.deliveryId,
        result,
        completedAt: this.#ports.clock.now(),
      });
      return result;
    }

    const policyDecision = await this.#ports.policy.evaluate({ intent, verification });
    assertNoInlineSecrets(policyDecision);
    if (
      policyDecision.id !== intent.policyDecisionId
      || policyDecision.securityDomain !== intent.securityDomain
    ) {
      throw new Error("Draft delivery policy must match the requested policy and security domain.");
    }
    const allowed = policyDecision.decision === "allow";
    await this.#ports.store.recordGate({
      deliveryId: intent.deliveryId,
      verificationId: verification.id,
      policyDecision,
      allowed,
      recordedAt: this.#ports.clock.now(),
    });
    if (!allowed) {
      const result: VerifiedDraftDeliveryResult = {
        kind: "blocked-policy",
        verification,
        policyDecision,
      };
      await this.#ports.store.complete({
        deliveryId: intent.deliveryId,
        result,
        completedAt: this.#ports.clock.now(),
      });
      return result;
    }

    const pullRequest = assertGatewayReference(await this.#ports.gateway.createDraft(intent));
    const result: VerifiedDraftDeliveryResult = {
      kind: "draft-created",
      verification,
      pullRequest,
    };
    await this.#ports.store.complete({
      deliveryId: intent.deliveryId,
      result,
      completedAt: this.#ports.clock.now(),
    });
    return result;
  }
}
