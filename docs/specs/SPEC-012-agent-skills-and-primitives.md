---
id: SPEC-012
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: SPEC-007, SPEC-008
cross_references: SPEC-009, SPEC-013, SPEC-017
---

# SPEC-012: Agent Skills and Primitives

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Define portable behavioral packages and honest enforcement across coding-agent harnesses.

## Source and build model

A separate primitives repository owns harness-neutral primitives and installable bundles. Each primitive declares tools, capabilities, read/write contract, security domains, outputs, and enforcement truth. AgentOps renders appropriate forms per harness.

## Initial bundle

The core bundle includes slice execution, authentication handoff, blocker escalation, completion reporting, verification gate, GitHub delivery, and FinOps reporting. Runtime facts and credentials remain in the Coordinator and secret store, never prompts.

## Versioning and routing

Workers report installed bundle and primitive versions. Jobs may require semver ranges; missing or insufficient enforced skills reject dispatch.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-SKILL-001 | Every primitive declares purpose, capabilities, security domains, output contract, and harness-specific enforcement. | Manifest schema validation. |
| REQ-SKILL-002 | Primitives remain portable and do not embed host availability, session IDs, or secrets. | Static skill audit. |
| REQ-SKILL-003 | Workers report installed skill and bundle versions in their capability manifest. | Worker manifest test. |
| REQ-SKILL-004 | The Coordinator rejects a job with an absent or incompatible required enforced skill. | Missing-skill dispatch test. |
| REQ-SKILL-005 | Policy enforcement uses deterministic code where practical. | Enforcement classification review. |
| REQ-SKILL-006 | Authentication and reporting skills redact secrets while preserving operational details. | Redaction and relay test. |

## Acceptance

A missing required authentication skill blocks dispatch, then a declared installation path produces a redacted attention item.

## Open decisions and assumptions

Define bundle distribution and signing mechanism.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
