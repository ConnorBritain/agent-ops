---
id: SPEC-000
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: CAT-001
cross_references: SPEC-001, SPEC-002, SPEC-003, SPEC-019
---

# SPEC-000: AgentOps Program Charter

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Define a portable, provider-neutral system that lets a human supervise bounded coding-agent work without treating chat or terminal history as the operating record.

## Operating model

The human is final authority. The Coordinator converts intent into bounded work, applies deterministic policy, chooses eligible placement, observes execution, and surfaces meaningful attention. Workers execute jobs but do not redefine priority, trust boundaries, or privileges.

## Systems of record

A portfolio tracker owns organizational commitments; Roadmap owns repository-local decomposition and worktree readiness; Supabase Postgres owns execution state, health, attention, policy decisions, events, and FinOps attribution; GitHub owns source, pull requests, CI evidence, and accepted artifacts.

## Program invariants

Models propose while policy authorizes. Security domains are hard constraints. External integrations are projections. Workers protect hosts before accepting work. Version-controlled code, configuration, migrations, and documented secret references make the platform reproducible.

## v1 outcome

A bounded request resolves a ready slice, receives an estimate, runs on an eligible worker through a supported CLI provider, relays a blocker, resumes after a durable response, passes independent verification, opens a draft pull request, and retains evidence, attention, time, and cost lineage.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-CHARTER-001 | Attention management is the primary user-facing product. | Attention-item scenario. |
| REQ-CHARTER-002 | Only the Coordinator converts human intent into an authorized job envelope. | Command-to-job audit trace. |
| REQ-CHARTER-003 | Workers execute bounded jobs and cannot self-authorize policy exceptions. | Denied self-escalation fixture. |
| REQ-CHARTER-004 | Accepted tasks retain readable request, execution, verification, attention, and outcome evidence. | Accepted-task evidence export. |
| REQ-CHARTER-005 | Restricted-domain inventory remains unavailable for autonomous dispatch until federation approval exists. | Scheduler rejection test. |
| REQ-CHARTER-006 | The platform is reinstallable from version-controlled artifacts and runbooks. | Clean-host bootstrap rehearsal. |

## Acceptance

The program has named authorities, enforceable scope boundaries, and a testable v1 vertical-slice definition.

## Open decisions and assumptions

Select a federation design before enabling any restricted-domain worker.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
