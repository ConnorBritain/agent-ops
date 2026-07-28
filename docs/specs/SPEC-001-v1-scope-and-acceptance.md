---
id: SPEC-001
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: SPEC-000
cross_references: SPEC-006, SPEC-007, SPEC-017, SPEC-018
---

# SPEC-001: V1 Scope and Acceptance

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Set a narrow v1 that proves the governed operating loop before desktop automation, federation, or high availability.

## In scope

V1 includes approved personal workers, a durable operational core, Slack command and attention handling, Roadmap readiness and worktree preparation, two normalized CLI providers, draft pull-request delivery, meaningful portfolio projection, estimation capture, and allocation-ready FinOps.

## Reference vertical slice

A request creates a task and run, resolves a Roadmap slice, passes policy, selects an eligible worker, launches a provider, records normalized events, surfaces one attention item, receives a durable answer, verifies the result, opens a draft pull request, and projects completion and cost.

## Explicit exclusions

V1 excludes automatic merging, production deployment, cross-domain code exchange, opaque scheduling, autonomous browser control, and a production-ready restricted-domain worker. Observed desktop/browser paths require human confirmation until supported automation exists.

## Definition of done

Completion requires behavior, executable acceptance, Roadmap representation, and relevant ADR reconciliation. The demonstration uses a reversible change and proves both restart-safe recovery and a resource-gate refusal.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-V1-001 | V1 supports approved personal workers with health registration and heartbeats. | Worker health scenario. |
| REQ-V1-002 | V1 persists task, run, session, event, attention, approval, estimate, and allocation records. | Schema and traceability test. |
| REQ-V1-003 | V1 supports at least two normalized CLI providers. | Provider conformance fixture. |
| REQ-V1-004 | V1 relays one blocked question and resumes the same run after a durable answer. | Intervention scenario. |
| REQ-V1-005 | V1 opens a draft pull request only after a configured verification verdict. | Delivery scenario. |
| REQ-V1-006 | V1 refuses launch when a resource threshold is violated. | Resource-gate test. |
| REQ-V1-007 | V1 never dispatches a personal workload to a restricted-domain worker. | Cross-domain negative test. |

## Acceptance

All entries in the v1 acceptance catalog are green, the end-to-end scenario is replayable, and known gaps are explicit.

## Open decisions and assumptions

Choose the first CLI launch substrate after a bounded integration spike.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
