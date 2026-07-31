import {
  assertNoInlineSecrets,
  curatedMemoryRecordSchema,
  memoryCandidateSchema,
  memoryRetrievalQuerySchema,
  type CuratedMemoryRecord,
  type MemoryCandidate,
  type MemoryRetrievalQuery,
} from "@agent-ops/contracts";
import {
  assertCuratedMemoryLineage,
  assertMemorySupersession,
  type CuratedMemoryGraphPort,
  type CuratedMemoryStore,
  type MemorySupersession,
} from "@agent-ops/domain";

export type CuratedMemoryGraphStatus = "indexed" | "unavailable";

export type CuratedMemoryCurationResult = {
  readonly record: CuratedMemoryRecord;
  readonly graph: CuratedMemoryGraphStatus;
};

export type CuratedMemoryRetrievalResult =
  | {
    readonly source: "graph";
    readonly records: readonly CuratedMemoryRecord[];
    readonly coreOperationBlocked: false;
  }
  | {
    readonly source: "unavailable";
    readonly records: readonly [];
    readonly coreOperationBlocked: false;
  };

export type CuratedMemoryCurationPorts = {
  readonly store: CuratedMemoryStore;
  readonly graph: CuratedMemoryGraphPort;
};

/**
 * A backend-neutral curation boundary. The store holds curation audit facts,
 * while Git-backed ADRs remain the canonical record. The graph is an optional
 * derived index, not a scheduling or authorization dependency.
 */
export class CuratedMemoryCurationService {
  readonly #ports: CuratedMemoryCurationPorts;

  constructor(ports: CuratedMemoryCurationPorts) {
    this.#ports = ports;
  }

  /** Workers and other actors may submit a candidate, but this never indexes or accepts it. */
  async submitCandidate(input: MemoryCandidate): Promise<MemoryCandidate> {
    assertNoInlineSecrets(input);
    const candidate = memoryCandidateSchema.parse(input);
    await this.#ports.store.recordCandidate(candidate);
    return candidate;
  }

  async accept(input: {
    readonly candidate: MemoryCandidate;
    readonly record: CuratedMemoryRecord;
  }): Promise<CuratedMemoryCurationResult> {
    assertNoInlineSecrets(input);
    const candidate = memoryCandidateSchema.parse(input.candidate);
    const record = curatedMemoryRecordSchema.parse(input.record);
    assertCuratedMemoryLineage({ candidate, record });
    await this.#ports.store.recordAcceptance(record);
    return { record, graph: await this.index(record) };
  }

  async supersede(input: {
    readonly candidate: MemoryCandidate;
    readonly prior: CuratedMemoryRecord;
    readonly successor: CuratedMemoryRecord;
  }): Promise<{
    readonly prior: CuratedMemoryRecord;
    readonly successor: CuratedMemoryRecord;
    readonly graph: CuratedMemoryGraphStatus;
  }> {
    assertNoInlineSecrets(input);
    const candidate = memoryCandidateSchema.parse(input.candidate);
    const prior = curatedMemoryRecordSchema.parse(input.prior);
    const successor = curatedMemoryRecordSchema.parse(input.successor);
    assertCuratedMemoryLineage({ candidate, record: successor });
    const supersession: MemorySupersession = assertMemorySupersession({ prior, successor });
    await this.#ports.store.recordSupersession(supersession);
    const graph = await this.indexMany([prior, successor]);
    return { prior, successor, graph };
  }

  /**
   * Retrieval cannot affect core scheduling or authorization. A graph error,
   * malformed graph response, or domain mismatch is returned as unavailable or
   * omitted evidence instead of being retried, executed, or escalated here.
   */
  async retrieve(input: MemoryRetrievalQuery): Promise<CuratedMemoryRetrievalResult> {
    assertNoInlineSecrets(input);
    const query = memoryRetrievalQuerySchema.parse(input);
    try {
      const records = await this.#ports.graph.retrieve(query);
      const filtered = records.flatMap((raw) => {
        assertNoInlineSecrets(raw);
        const record = curatedMemoryRecordSchema.parse(raw);
        if (record.state !== "accepted" || record.securityDomain !== query.securityDomain) return [];
        if (
          query.repositoryRef
          && !record.applicableRepositories.includes(query.repositoryRef)
        ) return [];
        return [record];
      });
      return { source: "graph", records: filtered, coreOperationBlocked: false };
    } catch {
      return { source: "unavailable", records: [], coreOperationBlocked: false };
    }
  }

  private async index(record: CuratedMemoryRecord): Promise<CuratedMemoryGraphStatus> {
    return this.indexMany([record]);
  }

  private async indexMany(records: readonly CuratedMemoryRecord[]): Promise<CuratedMemoryGraphStatus> {
    try {
      for (const record of records) await this.#ports.graph.index(record);
      return "indexed";
    } catch {
      return "unavailable";
    }
  }
}
