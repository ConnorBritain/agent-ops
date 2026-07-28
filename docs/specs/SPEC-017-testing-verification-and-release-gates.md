---
id: SPEC-017
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: SPEC-001, SPEC-004, SPEC-005, SPEC-009
cross_references: SPEC-011, SPEC-012, SPEC-015, SPEC-018
---

# SPEC-017: Testing, Verification and Release Gates

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Turn specifications into executable evidence and prevent code existence from being mistaken for completion.

## Triangulation

Every slice maps stable requirements, acceptance scenarios, Roadmap state, code and tests, and relevant ADRs. Tests span pure domain, adapters, migrations, provider/worker integration, deterministic fixtures, end-to-end fleet behavior, recovery, resources, security negatives, and manual acceptance paths.

## Verification

The implementation provider is not its own only judge. A separate verifier inspects the requested outcome, changed files, test evidence, policy compliance, and gates, then records pass, conditional pass, needs-human-review, or fail.

## Acceptance fixtures

Fixtures cover duplicate events, stale leases, missing skills, low disk, unsafe deletion, reboot, provider crash, retry, external outage, authentication handoff, browser classification, remote-access classification, and cross-domain dispatch.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-TEST-001 | Completed Roadmap slices map stable requirements and executable acceptance evidence. | Traceability report. |
| REQ-TEST-002 | Provider adapters pass a shared contract suite using PrintProvider or deterministic fixtures. | Provider conformance suite. |
| REQ-TEST-003 | Verification results persist separately from implementation-provider output. | Independent-verifier test. |
| REQ-TEST-004 | Draft pull-request creation is gated by verification and policy checks. | PR-gate test. |
| REQ-TEST-005 | Security, resource, idempotency, reboot, outage, and remote-access scenarios have negative or recovery fixtures. | Scenario catalog review. |
| REQ-TEST-006 | Release gates block schema incompatibility, failed redaction, and unaddressed critical safety tests. | Release-gate matrix. |

## Acceptance

Traceability shows no completed slice without evidence; end-to-end fixtures prove verified draft delivery and intentional negative cases.

## Open decisions and assumptions

Choose the full CI provider and integration-test environment after Phase 0.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
