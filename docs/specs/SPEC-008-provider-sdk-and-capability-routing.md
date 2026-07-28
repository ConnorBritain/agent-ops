---
id: SPEC-008
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: SPEC-005, SPEC-006
cross_references: SPEC-007, SPEC-009, SPEC-017
---

# SPEC-008: Provider SDK and Capability Routing

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Choose execution by declared capability rather than binding the architecture to one provider or undocumented UI automation.

## Provider contract

A provider implements capability inspection, environment validation, start, input, inspection, pause, resume, cancellation, and artifact collection. It returns typed observations and never updates task state directly.

## Initial providers

Two CLI providers establish the normalized v1 path. An observation console stays isolated. PrintProvider renders planned launch with no execution. Manual SSH is a structured handoff, not autonomous orchestration.

## Routing

Security, operating system, repository, capability, skill, credential, and resource prerequisites filter placements before affinity, load, recovery, preference, duration, and cost scoring. Browser and visual work normally prefers an approved interactive worker; headless long-running work prefers approved long-running workers.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-PROVIDER-001 | Each provider implements the common lifecycle contract or declares unsupported operations. | Provider conformance suite. |
| REQ-PROVIDER-002 | Tasks declare capabilities and do not require a vendor name absent explicit human preference. | Capability-routing test. |
| REQ-PROVIDER-003 | Provider observations normalize before affecting run state. | Normalization fixture. |
| REQ-PROVIDER-004 | PrintProvider renders a no-execution plan for every contract test. | Dry-run test. |
| REQ-PROVIDER-005 | Desktop and browser providers declare maturity and supported automation controls. | Maturity-manifest check. |
| REQ-PROVIDER-006 | Browser tasks declare allowed domains and write authority before launch. | Browser-policy test. |

## Acceptance

A bounded fixture is planned via PrintProvider and run through both CLI providers with equivalent state transitions and artifacts.

## Open decisions and assumptions

Select the first CLI provider and confirm its stable supported control surface.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
