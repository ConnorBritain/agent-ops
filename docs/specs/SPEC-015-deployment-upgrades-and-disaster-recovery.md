---
id: SPEC-015
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: SPEC-007, SPEC-010
cross_references: SPEC-016, SPEC-017, SPEC-019
---

# SPEC-015: Deployment, Upgrades and Disaster Recovery

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Make host replacement, recovery, and provider upgrades controlled deployment operations rather than re-architecture.

## Repository and environments

The public repository contains the Coordinator, worker, providers, contracts, policies, example fleet configuration, migrations, deployment definitions, runbooks, ADRs, tests, and its Roadmap. Secret values remain outside Git.

## Versioning and upgrades

Coordinator API, worker runtime, provider SDK, providers, skills, policies, database, job, and event schemas version independently. Workers report compatible ranges. Releases progress through development, canary, and stable channels.

## Recovery

Operational durability is independent of a host restart. Workers restore outbound connectivity after boot. Backups cover state, configuration, persistent memory data, and documented secret references. Replacement follows bootstrap, registration, validation, provisioning, health, and controlled drain.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-DEPLOY-001 | Deployment configuration and secret references are version-controlled separately from secret values. | Configuration review. |
| REQ-DEPLOY-002 | Runtime, provider, policy, and schema compatibility ranges are explicit. | Compatibility manifest test. |
| REQ-DEPLOY-003 | Releases promote development to canary to stable with a recorded compatibility check. | Promotion record. |
| REQ-DEPLOY-004 | Migrations are append-only and favor expand-before-contract. | Migration review. |
| REQ-DEPLOY-005 | Destructive migrations need backup, approval, and forward repair instructions. | Migration gate test. |
| REQ-DEPLOY-006 | Host replacement preserves task ledger and follows controlled enrollment. | Replacement rehearsal. |

## Acceptance

A simulated canary upgrade, incompatible-job rejection, and worker replacement preserve the ledger and restore fleet health.

## Open decisions and assumptions

Select environment topology and backup operators.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
