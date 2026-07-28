---
id: SPEC-016
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: SPEC-004, SPEC-007, SPEC-009
cross_references: SPEC-013, SPEC-015, SPEC-017
---

# SPEC-016: Observability, Operations and Runbooks

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Make the platform legible when healthy, degraded, or failing through a bounded attention inbox and recovery procedures.

## Signals

Workers report heartbeat, service state, provider health, session liveness, queue age, attention age, resource pressure, worktrees, processes, logs, reboot state, skill drift, outbox backlog, delivery failures, estimate error, human attention, and outcome quality.

## Views and alerts

Correlation keys include task, run, session, worker, provider, and security domain. Alerts are actionable attention items with severity, evidence, impact, suggested action, runbook link, and escalation deadline; ordinary progress remains quiet.

## Runbooks

Runbooks begin with safest diagnostics and state when owner or organization input is required. They cover offline hosts, access failures, private-network issues, low disk, processes, stale providers, outbox failures, migrations, worktrees, credentials, and reboot recovery.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-OPS-001 | Health, logs, metrics, and traces correlate with core IDs and security domain. | Correlation query. |
| REQ-OPS-002 | Redaction occurs before persistence or human-scale projection. | Redaction test. |
| REQ-OPS-003 | Critical resource floors, lost heartbeat, stale session, repeated provider failure, outbox age, and recovery failures produce actionable attention. | Alert scenario suite. |
| REQ-OPS-004 | Normal successful runs remain quiet. | Noise-suppression test. |
| REQ-OPS-005 | Runbooks begin with safe diagnostics and explicit stop conditions. | Runbook review. |
| REQ-OPS-006 | Operational dashboards answer attention, execution, health, backlog, completion, effort, and trend questions. | Operator-view acceptance. |

## Acceptance

Lost worker, low disk, and failed projection produce distinct actionable records while normal success remains quiet.

## Open decisions and assumptions

Select observability storage and dashboard implementation.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
