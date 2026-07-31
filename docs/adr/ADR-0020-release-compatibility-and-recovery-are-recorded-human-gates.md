# ADR-0020: Record release compatibility and recovery as human-gated durable evidence

Status: accepted

## Context

AgentOps needs version upgrades, schema evolution, backup verification, and
worker replacement to be recoverable without granting source code authority to
operate infrastructure. The public template must prove the release safety
model without selecting a backup product, connecting an environment, applying
a migration, or changing a host.

## Decision

Introduce strict, secret-safe contracts for a complete compatibility manifest,
human-approved development-to-canary and canary-to-stable promotion records,
append-only expand-before-contract migration gates, restoration-tested backup
verification, controlled worker-replacement rehearsals, and a final release
gate. Compatibility declarations state their backwards-compatibility behavior
and use stable internal component categories and opaque references.

The pure release-recovery gate requires the exact promotion chain, compatible
component observations, full backup coverage, destructive-migration approval
and forward repair, durable-ledger preservation, passed redaction verification,
and passed critical safety tests. It blocks rather than repairs or retries.

The public repository contains only static templates, typed contracts, pure
rules, deterministic in-memory fakes, and a safe diagnostic runbook. Actual
promotion, backup, migration, restoration, service management, and worker
enrollment remain separately authorized private operations.

## Consequences

- Versioned contracts make backwards-compatibility behavior reviewable before
  a change reaches a canary or stable channel.
- A destructive migration cannot be passed through the deterministic gate
  without a linked verified backup, human decision, and forward repair path.
- Replacing a worker is not accepted as recovery unless immutable durable-ledger
  records are retained and controlled enrollment/drain stages are recorded.
- Public fixture success is source-level evidence only; it neither proves nor
  authorizes a real backup, restore, promotion, migration, or host action.
