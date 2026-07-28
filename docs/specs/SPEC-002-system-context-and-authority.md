---
id: SPEC-002
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: SPEC-000
cross_references: SPEC-004, SPEC-005, SPEC-006, SPEC-011
---

# SPEC-002: System Context and Authority Boundaries

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Define component ownership and failure isolation so an external integration cannot become accidental source of truth.

## Context

The Coordinator sits between the human control surface and workers. It uses Roadmap for repository-local graph decisions, portable primitive bundles for behavior, and an independent estimator for calibration. Each external system is behind a named adapter and typed capability contract.

## Authority map

The Coordinator creates tasks, runs, and attention items but never bypasses policy. A Scheduler selects only eligible placements. Providers start and inspect sessions but do not directly update portfolio commitments. Sync projects verified state through an outbox.

## Failure isolation

An outage in chat, portfolio tracking, memory, or a provider queues or blocks projections without corrupting internal task, run, policy, or evidence state.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-CONTEXT-001 | External dependencies are accessed through named adapters with typed contracts. | Adapter boundary review. |
| REQ-CONTEXT-002 | Internal operational state stays authoritative when an external sync fails. | Outage tests. |
| REQ-CONTEXT-003 | An adapter cannot write a domain it does not own without a Coordinator-issued command. | Authorization integration test. |
| REQ-CONTEXT-004 | Imported facts record source, source event ID, occurrence time, and ingestion time. | Provenance assertion. |
| REQ-CONTEXT-005 | Roadmap, primitives, estimation, and architecture references remain independently versioned. | Dependency manifest review. |
| REQ-CONTEXT-006 | External projections are replayable from an outbox. | Outbox replay scenario. |

## Acceptance

Simulated non-authoritative dependency outages preserve coherent task and run state and create a recoverable projection backlog.

## Open decisions and assumptions

Define the minimum status data allowed across any future federation boundary.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
