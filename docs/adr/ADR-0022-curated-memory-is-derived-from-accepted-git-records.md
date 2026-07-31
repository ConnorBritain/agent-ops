# ADR-0022: Keep curated temporal memory derived from accepted Git records

Status: accepted

## Context

AgentOps needs contextual memory without allowing a graph database, worker
conclusion, or provider output to become unreviewed architectural truth.
Memory may contain sensitive operational context, must stay within a security
domain, and cannot be permitted to block the Coordinator's core scheduling or
authorization decisions when unavailable.

## Decision

Git-backed ADRs are canonical. Workers and integrations may submit bounded,
redacted memory candidates, but only a human curator can accept an
ADR- or curated-episode-derived record. Accepted records retain source,
security-domain, repository scope, and validity provenance. Supersession
retains both the prior record and a two-way successor relationship.

The temporal graph is an optional derived index behind a backend-neutral port.
It receives records only after the curation audit is recorded. Retrieval is
domain- and repository-filtered and returns a non-blocking unavailable result
when the graph fails. The graph cannot grant scheduling or authorization
authority, and it cannot modify Git-backed ADRs.

## Consequences

- Candidate submission, human curation, source acceptance, supersession,
  domain filtering, and outage isolation are deterministic test fixtures.
- No Graphiti SDK, graph endpoint, Docker deployment, service, credential, or
  private memory record is committed to the public repository.
- A Graphiti-compatible deployment remains a separately authorized private
  decision with a protected data/retention design and operational runbook.
