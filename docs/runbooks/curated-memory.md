# Curated memory runbook

## Scope and stop conditions

This runbook validates source-level curation behavior. Stop before connecting
to a graph endpoint, Docker daemon, database, host, credential store, or
environment; creating a container; configuring an endpoint; materializing a
secret; or importing private records. A passing fixture is not authorization
to deploy Graphiti or any other graph backend.

## Source-level diagnostic

1. Confirm Git-backed ADRs are named as canonical and graph records as derived.
2. Confirm a candidate can be submitted by a worker but cannot be accepted or
   indexed without a human curator in the same security domain.
3. Confirm each accepted record names an accepted ADR or curated-episode
   source, preserves a bounded redacted summary, and does not broaden the
   candidate's repository scope.
4. Confirm supersession has both links, retains the prior source/rationale,
   closes prior validity, and opens successor validity.
5. Confirm retrieval excludes a mismatched domain, an out-of-scope repository,
   and a superseded record.
6. Confirm graph index and retrieval failures return non-blocking unavailable
   results and do not invoke scheduling, authorization, retry, deployment, or
   service-start behavior.

The only command in this public slice is the source-only validation command
`pnpm run check:graphiti-curation`; it has no graph, Docker, host, network, or
deployment effect.

## Separately authorized private implementation

Before selecting or deploying a graph backend, record a private authorization,
security-domain and retention design, endpoint/credential references, backup
and recovery method, data-classification and sanitization rules, operator and
abort procedure, and scoped validation evidence. Keep backend topology,
device/host facts, raw episodes, access records, and all secret values in the
private overlay or approved secret stores only.
