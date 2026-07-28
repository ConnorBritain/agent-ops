---
id: CAT-001
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: none
cross_references: SPEC-000 through SPEC-019, BUILD-001
---

# CAT-001: AgentOps Specification Catalog and Reading Guide

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Provide the authoritative entry point, reading order, document convention, and traceability method for the public AgentOps specification set.

## How to use this set

Read the charter and v1 scope first. Establish authority, security, data, contracts, and runtime boundaries before writing implementation code. Integration, intelligence, operations, testing, and rollout specifications follow. BUILD-001 guides an implementation session but never overrides a normative specification.

## Governance triangulation

Normative specifications, executable acceptance scenarios, Roadmap slices, and ADRs remain synchronized. A slice is incomplete until requirement mappings, evidence, Roadmap state, and relevant ADRs agree. Current status, blockers, and known gaps are part of the handoff record.

## Implementation handoff

When truth is unclear, consult the owning specification, its acceptance scenario, the Roadmap slice, the ADR record, and current status documents—in that order. Do not infer durable state from a chat or provider transcript.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-CATALOG-001 | Every normative specification declares an ID, version, status, dependencies, cross-references, requirements, acceptance evidence, and open decisions. | Metadata lint. |
| REQ-CATALOG-002 | Every completed slice maps to requirements, tests, Roadmap state, and relevant ADR evidence. | Traceability report. |
| REQ-CATALOG-003 | BUILD-001 is a governed implementation prompt and does not override normative specifications. | Prompt governance review. |

## Acceptance

A new implementation agent can locate requirement ownership, select the correct reading order, and identify the evidence required to complete a slice.

## Open decisions and assumptions

Automate documentation linting and traceability reporting in the repository bootstrap.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
