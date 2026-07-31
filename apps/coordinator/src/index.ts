import {
  assertNoInlineSecrets,
  commandSchema,
  signedJobEnvelopeSchema,
  type AttentionItem,
  type Command,
  type SignedJobEnvelope,
} from "@agent-ops/contracts";
import {
  reconcileObservedState,
  selectPlacement,
  type AttentionDeliveryAttempt,
  type AttentionProjectionPort,
  type AttentionDraft,
  type CoordinatorDurableStore,
  type PlacementCandidate,
  type PolicyDecision,
  type ProviderAcknowledgement,
  type ReconciliationDecision,
  type ReconciliationSnapshot,
} from "@agent-ops/domain";

export interface CoordinatorClock {
  now(): string;
}

/** The policy boundary is authoritative before candidate placement begins. */
export interface CoordinatorPolicyEngine {
  evaluate(input: {
    readonly command: Command;
    readonly envelope: SignedJobEnvelope;
  }): Promise<PolicyDecision>;
}

export type WorkerDispatchAcknowledgement = {
  readonly providerSessionRef?: string;
  readonly acknowledgedAt: string;
};

/**
 * This port asks an assigned worker to accept a durable job. It has no power to
 * update Coordinator task/run state and its acknowledgement is only an
 * observation, never proof that execution is running.
 */
export interface CoordinatorWorkerDispatch {
  dispatch(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly providerId: string;
    readonly envelope: SignedJobEnvelope;
  }): Promise<
    | { readonly accepted: true; readonly acknowledgement: WorkerDispatchAcknowledgement }
    | { readonly accepted: false }
  >;
}

/**
 * A human-facing transport (such as a future chat adapter) is a projection
 * only. The durable attention item must already exist before this port runs.
 */
export type { AttentionDeliveryAttempt } from "@agent-ops/domain";
export type CoordinatorAttentionDelivery = AttentionProjectionPort;

export type CoordinatorRuntimePorts = {
  readonly clock: CoordinatorClock;
  readonly store: CoordinatorDurableStore;
  readonly policy: CoordinatorPolicyEngine;
  readonly workerDispatch: CoordinatorWorkerDispatch;
  readonly attentionDelivery: CoordinatorAttentionDelivery;
};

export type CoordinatorDispatchRequest = {
  readonly command: unknown;
  readonly envelope: unknown;
  readonly candidates: readonly PlacementCandidate[];
};

export type CoordinatorDispatchResult =
  | {
    readonly kind: "queued";
    readonly jobId: string;
    readonly workerId: string;
    readonly providerId: string;
    /** Acknowledged is intentionally not a run-state transition. */
    readonly providerAcknowledged: true;
  }
  | {
    readonly kind: "attention-required";
    readonly reason: "policy-denied" | "approval-required" | "no-eligible-candidate" | "worker-dispatch-unavailable";
    readonly attention: AttentionItem;
    readonly delivery: AttentionDeliveryAttempt;
  };

type PlacementAttentionReason = "policy-denied" | "approval-required" | "no-eligible-candidate";

export type CoordinatorAttentionResponseRequest = {
  readonly command: unknown;
  readonly response: Readonly<Record<string, unknown>>;
};

export type CoordinatorAttentionResponseResult = {
  readonly attention: AttentionItem;
  readonly delivery: AttentionDeliveryAttempt;
};

/**
 * A resume is an explicit human-response path, not automatic recovery. The
 * response is durably recorded first; the subsequent dispatch must target the
 * same retained task and run as the attention item.
 */
export type CoordinatorAnswerAndResumeRequest = {
  readonly answer: CoordinatorAttentionResponseRequest;
  readonly dispatch: CoordinatorDispatchRequest;
};

export type CoordinatorAnswerAndResumeResult = {
  readonly answer: CoordinatorAttentionResponseResult;
  readonly dispatch: CoordinatorDispatchResult;
};

export type CoordinatorReconciliationResult = {
  readonly snapshot: ReconciliationSnapshot;
  readonly decision: ReconciliationDecision;
  readonly attention?: AttentionItem;
  readonly delivery?: AttentionDeliveryAttempt;
};

const sameValues = (left: readonly string[], right: readonly string[]): boolean => {
  const canonical = (values: readonly string[]) => [...new Set(values)].sort().join("\u0000");
  return canonical(left) === canonical(right);
};

const candidateAudit = (candidate: PlacementCandidate) => ({
  workerId: candidate.workerId,
  providerId: candidate.providerId,
  securityDomain: candidate.securityDomain,
  capabilities: [...candidate.capabilities].sort(),
  skills: candidate.skills
    .map((skill) => ({ ...skill }))
    .sort((left, right) => left.key.localeCompare(right.key) || left.version.localeCompare(right.version)),
  healthy: candidate.healthy,
  preferenceScore: candidate.preferenceScore,
});

const attentionForPlacement = (input: {
  readonly taskId: string;
  readonly runId: string;
  readonly securityDomain: string;
  readonly reason: PlacementAttentionReason;
  readonly sourceEventId: string;
  readonly raisedAt: string;
}): AttentionDraft => {
  const descriptions = {
    "policy-denied": {
      type: "security" as const,
      summary: "Dispatch was denied by policy.",
    },
    "approval-required": {
      type: "approval" as const,
      summary: "Dispatch requires a recorded approval.",
    },
    "no-eligible-candidate": {
      type: "infrastructure" as const,
      summary: "No eligible worker/provider placement is available.",
    },
  };
  const description = descriptions[input.reason];
  return {
    taskId: input.taskId,
    runId: input.runId,
    securityDomain: input.securityDomain,
    type: description.type,
    summary: description.summary,
    sourceEventId: input.sourceEventId,
    raisedAt: input.raisedAt,
  };
};

export class CoordinatorRuntime {
  readonly #ports: CoordinatorRuntimePorts;

  constructor(ports: CoordinatorRuntimePorts) {
    this.#ports = ports;
  }

  async #persistThenDeliverAttention(draft: AttentionDraft): Promise<{
    readonly attention: AttentionItem;
    readonly delivery: AttentionDeliveryAttempt;
  }> {
    const attention = await this.#ports.store.createAttention(draft);
    try {
      return {
        attention,
        delivery: await this.#ports.attentionDelivery.deliver(attention),
      };
    } catch {
      // The attention remains durable and can be delivered later by an
      // authorized outbox/projection. This application service does not retry.
      return { attention, delivery: { status: "deferred" } };
    }
  }

  async dispatch(rawInput: CoordinatorDispatchRequest): Promise<CoordinatorDispatchResult> {
    const command = commandSchema.parse(rawInput.command);
    const envelope = signedJobEnvelopeSchema.parse(rawInput.envelope);
    if (command.kind !== "DispatchTask" || command.target.kind !== "task") {
      throw new Error("Coordinator dispatch requires a DispatchTask command targeting a task.");
    }
    if (
      command.target.id !== envelope.taskId
      || command.actor.securityDomain !== envelope.securityDomain
      || !sameValues(command.requiredCapabilities, envelope.requiredCapabilities)
    ) {
      throw new Error("Coordinator command and signed envelope must have matching task, domain, and capabilities.");
    }
    // A Set is not JSON-enumerable, so scan the durable representation rather
    // than the in-memory candidate objects directly.
    assertNoInlineSecrets(rawInput.candidates.map(candidateAudit));

    const persistedAt = this.#ports.clock.now();
    await this.#ports.store.recordIntent({
      command,
      taskId: envelope.taskId,
      runId: envelope.runId,
      securityDomain: envelope.securityDomain,
      persistedAt,
    });

    const policyDecision = await this.#ports.policy.evaluate({ command, envelope });
    if (
      policyDecision.id !== envelope.policyDecisionId
      || policyDecision.securityDomain !== envelope.securityDomain
    ) {
      throw new Error("Coordinator policy decision must match the signed envelope's policy and security domain.");
    }

    const placement = selectPlacement({
      securityDomain: envelope.securityDomain,
      requiredCapabilities: envelope.requiredCapabilities,
      requiredSkills: envelope.requiredSkills,
      ...(command.providerPreference ? { preferredProviderId: command.providerPreference } : {}),
      policyDecision,
    }, rawInput.candidates);
    await this.#ports.store.recordSchedulingDecision({
      taskId: envelope.taskId,
      runId: envelope.runId,
      securityDomain: envelope.securityDomain,
      policyDecision,
      requiredCapabilities: [...envelope.requiredCapabilities],
      requiredSkills: envelope.requiredSkills.map((skill) => ({ ...skill })),
      ...(command.providerPreference ? { preferredProviderId: command.providerPreference } : {}),
      candidates: rawInput.candidates.map(candidateAudit),
      placement,
      recordedAt: this.#ports.clock.now(),
    });

    if (!placement.accepted) {
      const raised = await this.#persistThenDeliverAttention(attentionForPlacement({
        taskId: envelope.taskId,
        runId: envelope.runId,
        securityDomain: envelope.securityDomain,
        reason: placement.reason,
        sourceEventId: `${command.idempotencyKey}:placement:${placement.reason}`,
        raisedAt: this.#ports.clock.now(),
      }));
      return { kind: "attention-required", reason: placement.reason, ...raised };
    }

    const jobId = await this.#ports.store.createJob({
      envelope,
      workerId: placement.selected.workerId,
      providerId: placement.selected.providerId,
      idempotencyKey: command.idempotencyKey,
    });

    let workerResult: Awaited<ReturnType<CoordinatorWorkerDispatch["dispatch"]>>;
    try {
      workerResult = await this.#ports.workerDispatch.dispatch({
        jobId,
        workerId: placement.selected.workerId,
        providerId: placement.selected.providerId,
        envelope,
      });
    } catch {
      workerResult = { accepted: false };
    }
    if (!workerResult.accepted) {
      const raised = await this.#persistThenDeliverAttention({
        taskId: envelope.taskId,
        runId: envelope.runId,
        securityDomain: envelope.securityDomain,
        type: "failure",
        summary: "A durable job could not be delivered to its assigned worker.",
        sourceEventId: `${command.idempotencyKey}:worker-dispatch-unavailable`,
        raisedAt: this.#ports.clock.now(),
      });
      return { kind: "attention-required", reason: "worker-dispatch-unavailable", ...raised };
    }

    const acknowledgement: ProviderAcknowledgement = {
      jobId,
      taskId: envelope.taskId,
      runId: envelope.runId,
      securityDomain: envelope.securityDomain,
      workerId: placement.selected.workerId,
      providerId: placement.selected.providerId,
      ...(workerResult.acknowledgement.providerSessionRef
        ? { providerSessionRef: workerResult.acknowledgement.providerSessionRef }
        : {}),
      acknowledgedAt: workerResult.acknowledgement.acknowledgedAt,
    };
    assertNoInlineSecrets(acknowledgement);
    await this.#ports.store.recordProviderAcknowledgement(acknowledgement);
    return {
      kind: "queued",
      jobId,
      workerId: placement.selected.workerId,
      providerId: placement.selected.providerId,
      providerAcknowledged: true,
    };
  }

  async answerAttention(
    rawInput: CoordinatorAttentionResponseRequest,
  ): Promise<CoordinatorAttentionResponseResult> {
    const command = commandSchema.parse(rawInput.command);
    if (command.kind !== "AnswerAttentionItem" || command.target.kind !== "attention-item") {
      throw new Error("Coordinator attention response requires an AnswerAttentionItem command.");
    }
    assertNoInlineSecrets(rawInput.response);
    const attention = await this.#ports.store.recordAttentionResponse({
      attentionItemId: command.target.id,
      command,
      response: rawInput.response,
      persistedAt: this.#ports.clock.now(),
    });
    try {
      return {
        attention,
        delivery: await this.#ports.attentionDelivery.deliverResponse({
          attention,
          response: rawInput.response,
        }),
      };
    } catch {
      return { attention, delivery: { status: "deferred" } };
    }
  }

  async answerAndResume(
    rawInput: CoordinatorAnswerAndResumeRequest,
  ): Promise<CoordinatorAnswerAndResumeResult> {
    const answer = await this.answerAttention(rawInput.answer);
    const command = commandSchema.parse(rawInput.dispatch.command);
    const envelope = signedJobEnvelopeSchema.parse(rawInput.dispatch.envelope);
    if (
      command.kind !== "DispatchTask"
      || command.target.kind !== "task"
      || !answer.attention.runId
      || answer.attention.taskId !== envelope.taskId
      || answer.attention.runId !== envelope.runId
      || command.target.id !== answer.attention.taskId
    ) {
      throw new Error("An answered attention item may resume only its retained task and run.");
    }
    return {
      answer,
      dispatch: await this.dispatch(rawInput.dispatch),
    };
  }

  async reconcile(): Promise<readonly CoordinatorReconciliationResult[]> {
    const snapshots = await this.#ports.store.listReconciliationSnapshots();
    const results: CoordinatorReconciliationResult[] = [];
    for (const snapshot of snapshots) {
      const decision = reconcileObservedState(snapshot);
      if (decision.kind === "no-change") {
        results.push({ snapshot, decision });
        continue;
      }
      const raised = await this.#persistThenDeliverAttention({
        taskId: snapshot.taskId,
        runId: snapshot.runId,
        securityDomain: snapshot.securityDomain,
        type: "failure",
        summary: `Run observation requires attention: ${decision.reason}.`,
        sourceEventId: `reconcile:${snapshot.runId}:${decision.reason}:${snapshot.observed}`,
        raisedAt: this.#ports.clock.now(),
      });
      results.push({ snapshot, decision, ...raised });
    }
    return results;
  }
}
