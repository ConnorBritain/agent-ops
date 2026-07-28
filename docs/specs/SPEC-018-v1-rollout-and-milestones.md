---
id: SPEC-018
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: SPEC-001 through SPEC-017
cross_references: SPEC-019, BUILD-001
---

# SPEC-018: V1 Rollout and Milestones

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Sequence delivery so useful control arrives early and new risk is added only after evidence.

## Phase sequence

Phase 0 is repository governance. Later phases establish host baseline, durable core, worker safety, Roadmap adapter and PrintProvider, first CLI path, attention loop, second provider and projections, skills/FinOps, observed browser support, memory curation, and only then approved federation.

## First real delivery

The first valuable slice is intentionally thin: request, durable state, Roadmap readiness, policy, eligible worker, bounded provider, normalized event, one blocker, durable response, verifier, draft pull request, meaningful projection, and estimate/actual/cost.

## Rollout safety

Release via development, canary, and stable channels. Capture resource baselines before normal concurrent workloads. A restricted domain remains documented but disabled until policy approval and a dedicated ADR.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-ROLL-001 | Each rollout phase has an explicit exit gate and evidence location. | Milestone report. |
| REQ-ROLL-002 | The first vertical slice proves the attention-and-delivery loop before broader automation. | End-to-end v1 slice. |
| REQ-ROLL-003 | Runtime versions promote through development, canary, and stable with compatibility evidence. | Promotion record. |
| REQ-ROLL-004 | Resource baselines exist before normal concurrent workloads on owner-approved workers. | Baseline inventory. |
| REQ-ROLL-005 | Restricted-domain federation is deferred until policy approval and a dedicated ADR. | Federation milestone gate. |
| REQ-ROLL-006 | A phase updates specifications, evidence, Roadmap state, and status records together. | Governance consistency check. |

## Acceptance

The Roadmap represents each phase and its gate; the first vertical slice runs in a disposable repository before use on a production repository.

## Open decisions and assumptions

Choose the first bounded disposable repository and issue.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
