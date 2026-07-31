import {
  assertNoInlineSecrets,
  coordinatorProjectionCommandSchema,
  externalProjectionFactSchema,
  type CoordinatorProjectionCommand,
  type ExternalProjectionFact,
  type ExternalProjectionIntent,
} from "@agent-ops/contracts";
import type {
  ExternalProjectionOutboxStore,
} from "@agent-ops/domain";

export type ProjectionSubmissionResult =
  | { readonly disposition: "delivered"; readonly fact: ExternalProjectionFact }
  | { readonly disposition: "queued"; readonly projectionId: string }
  | { readonly disposition: "suppressed"; readonly reason: "non-human-scale-transition" };

/**
 * GitHub is a bounded projection surface. A future implementation may create
 * only an already-approved draft or project independent CI evidence; it has no
 * generic issue, review, merge, release, deployment, or repository mutation
 * interface.
 */
export interface GitHubProjectionGateway {
  deliver(intent: Extract<ExternalProjectionIntent, {
    readonly kind: "github-draft-pull-request" | "github-ci-evidence";
  }>): Promise<ExternalProjectionFact>;
}

/**
 * A portfolio receives concise state transitions. It is never a task/run
 * authority and gets no operational transcript, provider output, or arbitrary
 * work log.
 */
export interface PortfolioProjectionGateway {
  deliver(intent: Extract<ExternalProjectionIntent, {
    readonly kind: "portfolio-transition";
  }>): Promise<ExternalProjectionFact>;
}

export interface ExternalProjectionClock {
  now(): string;
}

export type GitHubPortfolioProjectionPorts = {
  readonly clock: ExternalProjectionClock;
  readonly outbox: ExternalProjectionOutboxStore;
  readonly github: GitHubProjectionGateway;
  readonly portfolio: PortfolioProjectionGateway;
};

const meaningfulPortfolioTransitions = new Set([
  "created",
  "ready-for-review",
  "blocked",
  "completed",
  "failed",
]);

const isMeaningfulPortfolioTransition = (intent: ExternalProjectionIntent): boolean => (
  intent.kind !== "portfolio-transition"
  || meaningfulPortfolioTransitions.has(intent.transition)
);

const expectedSystem = (intent: ExternalProjectionIntent): "github" | "portfolio" => (
  intent.kind === "portfolio-transition" ? "portfolio" : "github"
);

/**
 * This application service persists an idempotency reservation before any
 * adapter call. A duplicate only observes durable state. A failed external
 * call is reduced to a retryable code, leaving internal state untouched; an
 * owner-authorized outbox runner must explicitly invoke `replay` later.
 */
export class GitHubPortfolioProjectionService {
  readonly #ports: GitHubPortfolioProjectionPorts;

  constructor(ports: GitHubPortfolioProjectionPorts) {
    this.#ports = ports;
  }

  async submit(rawCommand: unknown): Promise<ProjectionSubmissionResult> {
    const command = coordinatorProjectionCommandSchema.parse(rawCommand);
    assertNoInlineSecrets(command);
    if (!isMeaningfulPortfolioTransition(command.projection)) {
      return { disposition: "suppressed", reason: "non-human-scale-transition" };
    }

    const reservation = await this.#ports.outbox.reserve(command);
    if (reservation.state === "delivered") {
      return { disposition: "delivered", fact: reservation.fact };
    }
    if (reservation.state !== "new") {
      return { disposition: "queued", projectionId: command.projection.projectionId };
    }
    return this.replay(command.projection.projectionId);
  }

  async replay(projectionId: string): Promise<ProjectionSubmissionResult> {
    const claim = await this.#ports.outbox.claim(projectionId);
    if (claim.state === "delivered") {
      return { disposition: "delivered", fact: claim.fact };
    }
    if (claim.state !== "claimed") {
      return { disposition: "queued", projectionId };
    }

    const intent = claim.record.command.projection;
    try {
      const rawFact = await this.deliver(intent);
      let fact: ExternalProjectionFact;
      try {
        fact = externalProjectionFactSchema.parse(rawFact);
        assertNoInlineSecrets(fact);
        this.assertFactMatches(intent, fact);
      } catch {
        throw new Error("Projection fact is invalid or does not match its durable command.");
      }
      await this.#ports.outbox.markDelivered({
        projectionId: intent.projectionId,
        fact,
        deliveredAt: this.#ports.clock.now(),
      });
      return { disposition: "delivered", fact };
    } catch (error) {
      const errorCode = error instanceof Error && /Projection fact/.test(error.message)
        ? "protocol-invalid"
        : "external-unavailable";
      await this.#ports.outbox.markRetryable({
        projectionId: intent.projectionId,
        errorCode,
        availableAt: this.#ports.clock.now(),
      });
      return { disposition: "queued", projectionId: intent.projectionId };
    }
  }

  private async deliver(intent: ExternalProjectionIntent): Promise<ExternalProjectionFact> {
    if (intent.kind === "portfolio-transition") {
      return this.#ports.portfolio.deliver(intent);
    }
    return this.#ports.github.deliver(intent);
  }

  private assertFactMatches(intent: ExternalProjectionIntent, fact: ExternalProjectionFact): void {
    if (
      fact.projectionId !== intent.projectionId
      || fact.taskId !== intent.taskId
      || fact.runId !== intent.runId
      || fact.securityDomain !== intent.securityDomain
      || fact.system !== expectedSystem(intent)
    ) {
      throw new Error("Projection fact must match its durable command and declared destination.");
    }
  }
}
