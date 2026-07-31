import {
  assertNoInlineSecrets,
  normalizedEventSchema,
  roadmapPlanSchema,
  roadmapSliceDetailSchema,
  roadmapWorktreeIntentRequestSchema,
  roadmapWorktreeIntentSchema,
  signedJobEnvelopeSchema,
  type NormalizedEvent,
  type RoadmapWorktreeIntent,
  type RoadmapWorktreeIntentRequest,
} from "@agent-ops/contracts";
import type {
  CreateJobInput,
  DurableOperationOptions,
  DurableOperationalStore,
  LeaseGrant,
} from "@agent-ops/domain";

export type RpcError = {
  readonly code?: string;
  readonly message: string;
};

export type RpcOptions = {
  readonly signal: AbortSignal;
};

export interface RpcTransport {
  rpc<T>(
    functionName: string,
    arguments_: Readonly<Record<string, unknown>>,
    options: RpcOptions,
  ): Promise<{ readonly data: T | null; readonly error: RpcError | null }>;
}

export class DurableStoreError extends Error {
  readonly operation: string;
  readonly code: string | undefined;

  constructor(operation: string, error: RpcError) {
    super(`Durable store ${operation} failed${error.code ? ` (${error.code})` : ""}`);
    this.name = "DurableStoreError";
    this.operation = operation;
    this.code = error.code;
  }
}

export type RoadmapReadOptions = {
  readonly signal?: AbortSignal;
};

export interface RoadmapReadTransport {
  plan(options?: RoadmapReadOptions): Promise<unknown>;
  showSlice(input: { readonly invoke: string }, options?: RoadmapReadOptions): Promise<unknown>;
}

export interface RoadmapMcpClient {
  callTool(
    name: "plan" | "show",
    input: Readonly<Record<string, unknown>>,
    options?: RoadmapReadOptions,
  ): Promise<unknown>;
}

/**
 * Concrete mapping for Roadmap's read-only MCP tools. It deliberately exposes
 * neither a graph implementation nor a mutating/launching Roadmap command.
 */
export class RoadmapMcpReadTransport implements RoadmapReadTransport {
  private readonly client: RoadmapMcpClient;

  constructor(client: RoadmapMcpClient) {
    this.client = client;
  }

  plan(options?: RoadmapReadOptions): Promise<unknown> {
    return this.client.callTool("plan", {}, options);
  }

  showSlice(
    input: { readonly invoke: string },
    options?: RoadmapReadOptions,
  ): Promise<unknown> {
    return this.client.callTool("show", { invoke: input.invoke }, options);
  }
}

export class RoadmapAdapterError extends Error {
  readonly code: "INVALID_ROADMAP_RESPONSE" | "SLICE_NOT_READY" | "GATED_SLICE" | "MISMATCHED_SLICE";

  constructor(
    code: RoadmapAdapterError["code"],
    message: string,
  ) {
    super(message);
    this.name = "RoadmapAdapterError";
    this.code = code;
  }
}

/**
 * Reads Roadmap's own structured plan and slice-detail APIs. This adapter does
 * not read roadmap.yaml, infer dependencies, create a worktree, launch an
 * agent, or write back to Roadmap. `preparation: not-started` is deliberately
 * an intent for a separately authorized Roadmap operation.
 */
export class RoadmapReadAdapter {
  private readonly transport: RoadmapReadTransport;

  constructor(transport: RoadmapReadTransport) {
    this.transport = transport;
  }

  async resolveWorktreeIntent(
    input: RoadmapWorktreeIntentRequest,
    options?: RoadmapReadOptions,
  ): Promise<RoadmapWorktreeIntent> {
    const request = roadmapWorktreeIntentRequestSchema.parse(input);
    options?.signal?.throwIfAborted();

    const rawPlan = await this.transport.plan(options);
    assertNoInlineSecrets(rawPlan);
    let plan: ReturnType<typeof roadmapPlanSchema.parse>;
    try {
      plan = roadmapPlanSchema.parse(rawPlan);
    } catch {
      throw new RoadmapAdapterError(
        "INVALID_ROADMAP_RESPONSE",
        "Roadmap returned an invalid planning response.",
      );
    }
    const readyWave = plan.waves[0] ?? [];
    const selected = readyWave.find((slice) => slice.invoke === request.sliceKey);
    if (!selected) {
      throw new RoadmapAdapterError(
        "SLICE_NOT_READY",
        "Roadmap did not report the requested slice in its current ready wave.",
      );
    }

    const rawDetail = await this.transport.showSlice({ invoke: request.sliceKey }, options);
    assertNoInlineSecrets(rawDetail);
    let detail: ReturnType<typeof roadmapSliceDetailSchema.parse>;
    try {
      detail = roadmapSliceDetailSchema.parse(rawDetail);
    } catch {
      throw new RoadmapAdapterError(
        "INVALID_ROADMAP_RESPONSE",
        "Roadmap returned an invalid slice-detail response.",
      );
    }
    if (
      detail.invoke !== selected.invoke
      || detail.pi !== selected.pi
      || detail.sprint !== selected.sprint
      || detail.status !== selected.status
    ) {
      throw new RoadmapAdapterError(
        "MISMATCHED_SLICE",
        "Roadmap plan and slice detail did not identify the same stable slice.",
      );
    }
    if (detail.gatedOn || detail.status === "gated" || detail.status === "blocked") {
      throw new RoadmapAdapterError(
        "GATED_SLICE",
        "Roadmap reported a human or blocking gate for the requested slice.",
      );
    }

    return roadmapWorktreeIntentSchema.parse({
      version: request.version,
      correlationId: request.correlationId,
      taskId: request.taskId,
      runId: request.runId,
      securityDomain: request.securityDomain,
      slice: {
        key: selected.invoke,
        pi: selected.pi,
        sprint: selected.sprint,
        wave: 0,
      },
      gate: {
        source: "roadmap",
        expression: detail.gate,
      },
      worktree: {
        authority: "roadmap",
        branch: selected.branch,
        reference: selected.worktree,
        preparation: "not-started",
      },
    });
  }
}

type LeaseRow = {
  readonly acquired: boolean;
  readonly lease_name: string;
  readonly holder_principal_id: string;
  readonly fencing_token: number;
  readonly expires_at: string;
};

const DEFAULT_RPC_TIMEOUT_MS = 30_000;

function createRpcOptions(options?: DurableOperationOptions): RpcOptions {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
    throw new RangeError("RPC timeout must be an integer between 1 and 300000 milliseconds");
  }
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return {
    signal: options?.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal,
  };
}

function requireData<T>(
  operation: string,
  result: { readonly data: T | null; readonly error: RpcError | null },
): T {
  if (result.error) throw new DurableStoreError(operation, result.error);
  if (result.data === null) {
    throw new DurableStoreError(operation, { code: "EMPTY_RESULT", message: "No data" });
  }
  return result.data;
}

export class SupabaseDurableOperationalStore implements DurableOperationalStore {
  private readonly transport: RpcTransport;

  constructor(transport: RpcTransport) {
    this.transport = transport;
  }

  async acquireCoordinatorLease(input: {
    readonly leaseName: string;
    readonly holderPrincipalId: string;
    readonly ttlSeconds: number;
  }, options?: DurableOperationOptions): Promise<LeaseGrant> {
    const rows = requireData(
      "acquireCoordinatorLease",
      await this.transport.rpc<readonly LeaseRow[]>("acquire_coordinator_lease", {
        p_lease_name: input.leaseName,
        p_holder_principal_id: input.holderPrincipalId,
        p_ttl_seconds: input.ttlSeconds,
      }, createRpcOptions(options)),
    );
    const row = rows[0];
    if (!row || !Number.isSafeInteger(row.fencing_token) || row.fencing_token < 1) {
      throw new DurableStoreError("acquireCoordinatorLease", {
        code: "INVALID_RESULT",
        message: "Malformed lease row",
      });
    }
    return {
      acquired: row.acquired,
      leaseName: row.lease_name,
      holderPrincipalId: row.holder_principal_id,
      fencingToken: row.fencing_token,
      expiresAt: row.expires_at,
    };
  }

  async createJob(
    input: CreateJobInput,
    options?: DurableOperationOptions,
  ): Promise<string> {
    const envelope = signedJobEnvelopeSchema.parse(input.envelope);
    return requireData(
      "createJob",
      await this.transport.rpc<string>("create_job", {
        p_job_id: envelope.jobId,
        p_task_id: envelope.taskId,
        p_run_id: envelope.runId,
        p_worker_id: input.workerId,
        p_provider_id: input.providerId,
        p_security_domain_id: envelope.securityDomain,
        p_policy_decision_id: envelope.policyDecisionId,
        p_coordinator_principal_id: envelope.lease.holderId,
        p_coordinator_lease_name: envelope.lease.leaseName,
        p_fencing_token: envelope.lease.fencingToken,
        p_idempotency_key: input.idempotencyKey,
        p_envelope_version: envelope.version,
        p_envelope: envelope,
        p_signature_key_ref: envelope.signature.keyRef,
        p_signature: envelope.signature.value,
        p_lease_expires_at: envelope.lease.expiresAt,
      }, createRpcOptions(options)),
    );
  }

  async recordWorkerEvent(
    eventInput: NormalizedEvent,
    options?: DurableOperationOptions,
  ): Promise<string> {
    const event = normalizedEventSchema.parse(eventInput);
    return requireData(
      "recordWorkerEvent",
      await this.transport.rpc<string>("record_worker_event", {
        p_version: event.version,
        p_event_type: event.type,
        p_entity_type: event.entity.type,
        p_entity_id: event.entity.id,
        p_source_event_id: event.sourceEventId,
        p_occurred_at: event.occurredAt,
        p_security_domain_id: event.securityDomain,
        p_task_id: event.taskId,
        p_run_id: event.runId,
        p_payload: event.payload,
      }, createRpcOptions(options)),
    );
  }
}
export * from "./slack-attention.ts";
export * from "./verified-draft-delivery.ts";
export * from "./github-portfolio-projections.ts";
export * from "./skills-estimation-finops.ts";
