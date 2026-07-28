---
id: SPEC-006
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: SPEC-004, SPEC-005
cross_references: SPEC-007, SPEC-008, SPEC-009, SPEC-011
---

# SPEC-006: Coordinator Runtime

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Define the long-running control service that coordinates work across providers, repositories, and workers.

## Modules

Intent Gateway, Task Service, Policy Engine, Capability Scheduler, Worker Registry, Provider Registry, Run Controller, Reconciler, Attention Manager, External Sync Engine, Estimator, Memory Curator, FinOps Allocator, and Audit Writer share typed contracts while isolating domain decisions from I/O.

## Lifecycle

Task and Run state machines are separate. Reconciliation compares desired with observed worker and provider state; a start acknowledgement is not proof of a healthy session.

## Attention discipline

Escalations include a concise Coordinator summary, exact worker question, links, and safe response actions. A reply persists before it reaches a worker session.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-COORD-001 | Policy applies before Scheduler placement. | Dispatch ordering test. |
| REQ-COORD-002 | Security and required capability filter candidates before scoring. | Candidate-filter test. |
| REQ-COORD-003 | A Reconciler periodically compares desired and observed state. | Stale-session scenario. |
| REQ-COORD-004 | Attention responses persist before delivery to a session. | Response persistence test. |
| REQ-COORD-005 | Provider acknowledgement alone is not evidence of a running job. | False-positive start test. |
| REQ-COORD-006 | Scheduling decisions record inputs, exclusions, score rationale, and selected placement. | Audit decision query. |

## Acceptance

A provider death becomes a recoverable attention item while preserving scheduling and policy evidence.

## Open decisions and assumptions

Select Coordinator process topology for the first implementation slice.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
