# ADR-0014: Persist Coordinator intent and attention before transport delivery

Status: accepted

## Context

The Coordinator is the only application boundary permitted to turn an
authorized command into a durable job. A chat portal, worker, provider, or
remote-access tool must not become an alternate source of operational truth.
Provider acknowledgement also cannot prove a workload has started: it may be
stale, lost, or rejected after acknowledgement.

The system needs deterministic, replayable behavior when policy denies work,
no placement exists, an assigned worker is unavailable, a provider is stale,
or human input is required.

## Decision

The public `apps/coordinator` service composes explicit policy, durable-store,
assigned-worker, and attention-projection ports.

- Persist an intent before evaluating policy or selecting a worker.
- Evaluate policy before Scheduler placement, then persist the full scheduling
  decision, including exclusions and rationale.
- Persist a job before an assigned-worker dispatch attempt.
- Record a provider acknowledgement solely as an observation; reconciliation
  requires independent observed state before it considers a run running.
- Persist every actionable attention item and attention response before calling
  an external delivery port. Delivery errors are deferred, not retried by the
  application service.
- Reconciliation turns stale, unavailable, failed, or divergent state into
  attention with automatic workload restart disabled.

## Consequences

- A future Slack integration is a non-authoritative attention projection.
- A future database adapter must implement `CoordinatorDurableStore` through
  audited state and outbox operations; no direct chat/provider write path is
  acceptable.
- Periodic invocation, hosted binding, scoped identity provisioning, provider
  launch, and external delivery remain separate authorized composition work.
- Deterministic fixtures can prove authority and ordering without connecting a
  host, cloud project, chat workspace, provider, or credential.
