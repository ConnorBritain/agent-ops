---
id: SPEC-019
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: SPEC-003, SPEC-007, SPEC-010
cross_references: SPEC-008, SPEC-009, SPEC-015, SPEC-018
---

# SPEC-019: Host Inventory and Initial Fleet Configuration

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Keep worker enrollment configuration-driven while enforcing ownership, domain, capability, and resource safeguards.

## Reference roles

A generalized fleet may include an interactive visual worker, one or more long-running workers, and a restricted-domain inventory record. Names, accounts, network values, locations, and hardware details are private deployment data and never public template values.

## Configuration shape

Every worker record holds worker ID, owner permission, operating system, security domain, allowed repository patterns, providers, capabilities, resource policy, current status, heartbeat, service state, credential references, skills, remote-access profile, and bootstrap verification time.

## Enrollment and care

A new owner-approved worker needs physical-location and cooling review, dedicated account, post-boot private-network and terminal access validation, power policy, recovery constraints, resource baseline, and explicit service authorization. Routing hints never override domain, policy, compatibility, or resource safety.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-FLEET-001 | Each worker record contains owner permission, OS, domain, capabilities, resource policy, service state, credential references, and bootstrap verification. | Fleet-config validation. |
| REQ-FLEET-002 | Interactive visual capability is advertised only when declared maturity and health support it. | Capability-health test. |
| REQ-FLEET-003 | Long-running capability is advertised only when service, monitors, and declared work environment are healthy. | Worker readiness test. |
| REQ-FLEET-004 | Restricted-domain inventory is present but unavailable for autonomous dispatch in v1. | Fleet-routing negative test. |
| REQ-FLEET-005 | A future worker completes bootstrap and resource baseline before normal dispatch. | Enrollment checklist test. |
| REQ-FLEET-006 | Routing hints never override domain, policy, compatibility, or resource constraints. | Constraint-precedence test. |

## Acceptance

Example configuration renders generic worker roles, explains preference decisions, and refuses cross-domain placement.

## Open decisions and assumptions

Capture real deployment inventory only in a private overlay after owner authorization.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
