import {
  normalizedEventSchema,
  signedJobEnvelopeSchema,
  type NormalizedEvent,
} from "@agent-ops/contracts";
import type {
  CreateJobInput,
  DurableOperationalStore,
  LeaseGrant,
} from "@agent-ops/domain";

export type RpcError = {
  readonly code?: string;
  readonly message: string;
};

export interface RpcTransport {
  rpc<T>(
    functionName: string,
    arguments_: Readonly<Record<string, unknown>>,
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

type LeaseRow = {
  readonly acquired: boolean;
  readonly lease_name: string;
  readonly holder_principal_id: string;
  readonly fencing_token: number;
  readonly expires_at: string;
};

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
  }): Promise<LeaseGrant> {
    const rows = requireData(
      "acquireCoordinatorLease",
      await this.transport.rpc<readonly LeaseRow[]>("acquire_coordinator_lease", {
        p_lease_name: input.leaseName,
        p_holder_principal_id: input.holderPrincipalId,
        p_ttl_seconds: input.ttlSeconds,
      }),
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

  async createJob(input: CreateJobInput): Promise<string> {
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
      }),
    );
  }

  async recordWorkerEvent(eventInput: NormalizedEvent): Promise<string> {
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
      }),
    );
  }
}
