---
id: SPEC-011
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: SPEC-002, SPEC-005
cross_references: SPEC-006, SPEC-008, SPEC-017
---

# SPEC-011: Roadmap, Portfolio, GitHub and Chat Integration

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Compose existing planning, delivery, and communication tools while operational truth remains in AgentOps.

## Roadmap

Roadmap owns repository-local slices, dependencies, file contention, safe waves, worktrees, gates, and launch readiness. AgentOps asks Roadmap what can run and records the returned intent; it does not recreate that graph.

## Portfolio and GitHub

A portfolio tracker receives human-scale progress. GitHub remains source of branches, commits, pull requests, reviews, and CI evidence. A task can map to multiple slices and runs without forcing a one-to-one model.

## Chat

Chat is a direct-report and attention surface for concise summaries, exact worker questions, safe response actions, and links. It does not create a channel per session or become the only store of an approval.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-INT-001 | AgentOps calls Roadmap for readiness, waves, gates, and worktree preparation. | Roadmap adapter scenario. |
| REQ-INT-002 | Roadmap dispatch carries task and run IDs and returns stable slice and worktree references. | Correlation contract test. |
| REQ-INT-003 | Portfolio projections contain only meaningful human-scale transitions. | Noise-suppression test. |
| REQ-INT-004 | Tasks support explicit mappings to issues, slices, pull requests, and external sessions. | Multi-link lineage test. |
| REQ-INT-005 | Chat escalation separates Coordinator summary from exact worker question. | Verbatim-question UI test. |
| REQ-INT-006 | Integration writes use the outbox and preserve retriable delivery state. | Integration replay test. |

## Acceptance

A bounded issue maps to a Roadmap slice, produces a draft pull request, yields one attention item, and projects only meaningful transitions.

## Open decisions and assumptions

Select the first portfolio and chat adapters after the core path is proven.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
