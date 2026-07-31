import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CuratedMemoryCurationService } from "../src/index.ts";
import {
  buildCuratedMemoryRecord,
  buildMemoryCandidate,
  buildMemoryRetrievalQuery,
  InMemoryCuratedMemoryStore,
  StaticCuratedMemoryGraph,
  testIds,
} from "@agent-ops/test-kit";

const fixture = () => {
  const store = new InMemoryCuratedMemoryStore();
  const graph = new StaticCuratedMemoryGraph();
  const service = new CuratedMemoryCurationService({ store, graph });
  return { store, graph, service };
};

describe("curated memory boundary", () => {
  it("records a worker candidate without accepting or indexing it", async () => {
    const { store, graph, service } = fixture();
    const candidate = buildMemoryCandidate();

    const result = await service.submitCandidate(candidate);

    assert.equal(result.submittedBy.kind, "worker");
    assert.deepEqual(store.operations, ["candidate"]);
    assert.deepEqual(store.candidates, [candidate]);
    assert.deepEqual(graph.indexed, []);
  });

  it("requires a human-curated accepted record before derived indexing", async () => {
    const { store, graph, service } = fixture();
    const candidate = buildMemoryCandidate();
    await service.submitCandidate(candidate);
    const rejected = buildCuratedMemoryRecord({
      curator: { id: testIds.worker, kind: "worker", securityDomain: "example-domain" },
    });

    await assert.rejects(() => service.accept({ candidate, record: rejected }), /human curator/i);
    assert.deepEqual(store.operations, ["candidate"]);
    assert.deepEqual(graph.indexed, []);

    const record = buildCuratedMemoryRecord();
    const result = await service.accept({ candidate, record });
    assert.equal(result.graph, "indexed");
    assert.deepEqual(store.operations, ["candidate", "acceptance"]);
    assert.deepEqual(graph.indexed, [record]);
  });

  it("preserves linked source and validity history when human curation supersedes a record", async () => {
    const { store, graph, service } = fixture();
    const candidate = buildMemoryCandidate();
    const first = buildCuratedMemoryRecord();
    await service.accept({ candidate, record: first });
    const prior = buildCuratedMemoryRecord({
      state: "superseded",
      validTo: "2026-07-30T04:03:00Z",
      supersededByMemoryId: testIds.memorySuccessor,
    });
    const successor = buildCuratedMemoryRecord({
      id: testIds.memorySuccessor,
      supersedesMemoryId: testIds.memoryRecord,
      validFrom: "2026-07-30T04:03:00Z",
      curatedAt: "2026-07-30T04:03:00Z",
      redactedSummary: "A human accepted the revised, redacted memory record.",
    });

    const result = await service.supersede({ candidate, prior, successor });

    assert.equal(result.graph, "indexed");
    assert.deepEqual(store.operations, ["acceptance", "supersession"]);
    assert.equal(store.supersessions[0]?.prior.source.sourceRef, first.source.sourceRef);
    assert.equal(store.supersessions[0]?.prior.validTo, "2026-07-30T04:03:00Z");
    assert.equal(store.supersessions[0]?.successor.supersedesMemoryId, first.id);
    assert.deepEqual(graph.indexed, [first, prior, successor]);
  });

  it("filters graph retrieval by security domain, repository, and active state", async () => {
    const accepted = buildCuratedMemoryRecord();
    const wrongDomain = buildCuratedMemoryRecord({
      id: testIds.memorySuccessor,
      securityDomain: "other-domain",
      curator: { id: testIds.principal, kind: "human", securityDomain: "other-domain" },
    });
    const wrongRepository = buildCuratedMemoryRecord({
      id: testIds.memorySuccessor,
      applicableRepositories: ["repo://fixture/other"],
    });
    const superseded = buildCuratedMemoryRecord({
      state: "superseded",
      validTo: "2026-07-30T04:03:00Z",
      supersededByMemoryId: testIds.memorySuccessor,
    });
    const graph = new StaticCuratedMemoryGraph([accepted, wrongDomain, wrongRepository, superseded]);
    const service = new CuratedMemoryCurationService({
      store: new InMemoryCuratedMemoryStore(),
      graph,
    });

    const result = await service.retrieve(buildMemoryRetrievalQuery());

    assert.equal(result.source, "graph");
    assert.equal(result.coreOperationBlocked, false);
    assert.deepEqual(result.records, [accepted]);
    assert.equal(graph.queries.length, 1);
  });

  it("records accepted curation first and treats graph failure as non-blocking", async () => {
    const { store, graph, service } = fixture();
    const candidate = buildMemoryCandidate();
    const record = buildCuratedMemoryRecord();
    graph.throwOnIndex = true;

    const curation = await service.accept({ candidate, record });
    graph.throwOnRetrieve = true;
    const retrieval = await service.retrieve(buildMemoryRetrievalQuery());

    assert.equal(curation.graph, "unavailable");
    assert.deepEqual(store.acceptances, [record]);
    assert.equal(retrieval.source, "unavailable");
    assert.equal(retrieval.coreOperationBlocked, false);
    assert.deepEqual(retrieval.records, []);
  });
});
