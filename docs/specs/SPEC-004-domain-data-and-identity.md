---
id: SPEC-004
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: SPEC-002, SPEC-003
cross_references: SPEC-005, SPEC-006, SPEC-013, SPEC-016
---

# SPEC-004: Domain, Data and Identity Model

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Create a durable relational model for current truth, provenance, execution, planning, evidence, and cost.

## Core entities

Project, Task, Run, Session, Job, Worker, Provider, SkillInstallation, AttentionItem, Artifact, Estimate, Outcome, Allocation, Event, and OutboxItem have distinct lifecycles and ownership.

## Identifiers and mappings

Internal immutable identifiers remain independent of external identifiers. External portfolio issues, Roadmap slices, pull requests, provider sessions, and consoles are represented as explicit mappings. Audit events complement mutable current-state tables.

## Schemas

Operational, planning, provider, attention, policy, audit, FinOps, analytics, and integration concerns use explicit namespaces. Derived read models never overwrite source events or operational facts.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-DATA-001 | The model distinguishes Task from Run and Run from external Session. | Foreign-key lifecycle test. |
| REQ-DATA-002 | Internal identifiers are stable, immutable, and vendor-independent. | ID migration fixture. |
| REQ-DATA-003 | Mutable current state is explainable by append-only audit events. | State-to-event trace query. |
| REQ-DATA-004 | External mappings preserve provider, external ID, source timestamp, and synchronization state. | Mapping contract test. |
| REQ-DATA-005 | Cost, estimate, attention, and evidence trace to a task and applicable run. | Full-lineage query. |
| REQ-DATA-006 | Schema ownership uses explicit namespaces. | Migration review. |

## Acceptance

A sample issue traces through task, run, session, attention, artifact, outcome, and allocation without reading a chat transcript.

## Open decisions and assumptions

Choose sortable identifier format and retention periods.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
