# ADR-0018: Keep GitHub and portfolio projections non-authoritative and outbox-backed

Status: accepted

## Context

AgentOps needs useful visibility in delivery and portfolio systems while the
Coordinator remains the source of operational truth. GitHub and a portfolio
tracker can be unavailable, duplicate a request, return unexpected data, or
have a broader mutation surface than AgentOps should expose. The prior
verified-draft-delivery fixture established an independently verified,
draft-only decision; it intentionally did not provide a generic GitHub client
or a durable projection runner.

The next source-only slice must prove idempotency, replay, outage isolation,
human-scale portfolio updates, and multi-link lineage without creating an
external identity, repository, portfolio account, credential, network
connection, or background process.

## Decision

Introduce one versioned `CoordinatorProjectionCommand`, a small discriminated
projection-intent union, explicit external links, provenance-bearing external
facts, and an `ExternalProjectionOutboxStore` port.

The command is valid only when issued by a Coordinator actor in the matching
security domain. It may request only:

- an already bounded GitHub draft pull request;
- GitHub CI evidence projection; or
- a concise portfolio transition.

The service records a durable idempotency reservation before calling a named
GitHub or portfolio gateway. It records delivered facts only after schema,
correlation, system, and secret-safety validation. A gateway exception or bad
fact becomes a redacted retry code in the durable outbox. A duplicate command
observes the durable record, and a later explicit `replay` claims one pending
record; neither path contains a timer or automatic retry loop.

Portfolio projections suppress `running` and `provider-observed` noise. All
external mappings remain explicit: issue, Roadmap slice, pull request, and
external session can coexist for a task/run. Returned facts retain source,
source-event ID, occurrence time, and ingestion time.

## Consequences

- GitHub and portfolio are views of durable AgentOps decisions, not alternate
  task/run, policy, verification, or authority stores.
- The public contract forbids generic issue mutation, merge, review dismissal,
  release, deployment, provider control, raw endpoint configuration, and
  arbitrary external writes.
- Deterministic fakes prove failure recovery without a live account or SDK.
  A future private composition may bind a reviewed transactional outbox and
  scoped adapters only after owner authorization, disposable canary planning,
  rollback, and redacted evidence requirements are satisfied.
- The broader `ACC-PROJECTION-001` remains planned: `REQ-OPS-006` still needs
  an operator-view/dashboard acceptance, and its shared `REQ-TEST-005`
  scenario coverage includes separately gated private-canary evidence. The
  local projection requirements are complete without claiming that either
  operator-view or cross-environment runtime proof exists.
