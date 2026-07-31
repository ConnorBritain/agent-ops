# Curated memory boundary

Phase 10 defines a source-only, backend-neutral boundary for optional temporal
memory. Git-backed ADRs remain the canonical architectural record. A graph
implementation may improve retrieval later, but it is derived from accepted
ADRs and curated episodes; it never becomes a source of truth, a scheduler
input, or an authorization authority.

```text
worker or integration candidate
  -> durable candidate audit (not canonical)
  -> human curator accepts an ADR/episode-derived record
  -> optional derived graph index
  -> domain- and repository-filtered retrieval
```

## Authority and provenance

A worker, Coordinator, or integration may submit a bounded redacted candidate.
Submission never indexes, accepts, edits, or creates an ADR. An accepted record
requires a human curator in the same security domain, an explicitly accepted
ADR or curated-episode source, and a repository scope no broader than the
candidate. The curation audit is separate from Git and cannot amend canonical
history.

Supersession is explicit and append-only: the prior record retains its source,
redacted rationale, valid-to time, and successor link; the successor has its
own valid-from time and backward link. Retrieval exposes active accepted
records only and filters every result by security domain and, when requested,
repository scope.

## Optional graph isolation

`CuratedMemoryGraphPort` is a typed derived-index port. The public source has
no Graphiti SDK, container definition, network client, database connection,
endpoint, credential, timer, process launcher, or service configuration. A
Graphiti-compatible implementation is permitted only after a separately
authorized private deployment decision; Graphiti is not required by the
public contract.

Indexing runs only after the curation audit has been recorded. If indexing,
retrieval, or response validation fails, the result is `unavailable` with
`coreOperationBlocked: false`. No graph failure can create work, change a
policy decision, schedule a worker, retry itself, or cause automatic service
startup.

`pnpm run check:graphiti-curation` runs static and deterministic in-memory
fixtures only. It does not connect to a graph, Docker daemon, host, credential,
or environment.
