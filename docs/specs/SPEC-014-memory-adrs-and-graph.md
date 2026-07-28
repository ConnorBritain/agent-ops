---
id: SPEC-014
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: SPEC-002, SPEC-004
cross_references: SPEC-012, SPEC-016, SPEC-018
---

# SPEC-014: Memory, ADRs and Graph

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Preserve architectural decisions and temporal context without promoting raw chat or agent conclusions to canonical truth.

## Authority model

Git-backed ADRs are canonical human-readable architecture records. A temporal retrieval graph ingests accepted ADRs and curated episodes but is derived from reviewed sources. Workers may submit candidates but cannot freely write canonical truth.

## Decision lifecycle

Candidates move through proposed, accepted, superseded, revoked, or rejected states with source evidence, validity windows, supersession links, ADR path, retrieval identifier, security domain, and applicable repositories.

## Deployment

Memory retrieval improves context but cannot block authorization or core run state. Persistent backend choice, access, and backup are deferred deployment decisions.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-MEMORY-001 | ADRs are the canonical architectural record. | ADR review. |
| REQ-MEMORY-002 | Memory ingestion starts from accepted ADRs and curated sources. | Curation pipeline test. |
| REQ-MEMORY-003 | Workers submit candidates but cannot write canonical truth directly. | Write-authorization test. |
| REQ-MEMORY-004 | Supersession preserves prior rationale and validity history. | Supersession scenario. |
| REQ-MEMORY-005 | Memory records retain security-domain labels. | Domain-filter test. |
| REQ-MEMORY-006 | Memory retrieval failure does not block core scheduling or authorization. | Outage fixture. |

## Acceptance

An accepted ADR is retrieved as context and later superseded while its historical rationale remains available.

## Open decisions and assumptions

Select persistent graph backend and retention policy.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
