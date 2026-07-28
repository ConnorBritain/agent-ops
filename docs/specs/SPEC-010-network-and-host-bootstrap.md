---
id: SPEC-010
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: SPEC-003, SPEC-007
cross_references: SPEC-009, SPEC-015, SPEC-019
---

# SPEC-010: Network and Host Bootstrap

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Define the minimal physical and network preparation required before AgentOps worker software is installed.

## Minimum baseline

An approved personal host needs unattended private-network reachability, automatic secure-shell service, a dedicated authorized administrator account, a no-sleep policy while powered, approved physical placement, and post-reboot recovery verification.

## Remote visual access

RustDesk is a managed, human-operated visual recovery and inspection portal. It is optional to worker startup, does not replace the Coordinator's outbound connection, and cannot authorize scheduling or provider actions.

## Bootstrap order

Establish owner consent, reachability, power, cooling, and reboot recovery before remotely adding development tools, providers, skills, or worker services.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-NET-001 | Each approved personal worker is reachable through approved private networking after reboot without user login. | Post-reboot secure-shell test. |
| REQ-NET-002 | Secure-shell access starts automatically and is limited by approved network policy. | Service and access test. |
| REQ-NET-003 | Each worker uses a dedicated authorized account rather than an owner's daily account. | Host inventory review. |
| REQ-NET-004 | A worker has an owner-approved physical operating location and powered no-sleep configuration. | In-person checklist. |
| REQ-NET-005 | RustDesk or equivalent visual access is optional recovery tooling, not a worker-start dependency. | Headless visual-access test. |
| REQ-NET-006 | Bootstrap records disclose preboot conditions that can prevent remote recovery. | Host record validation. |

## Acceptance

A rebooted personal worker is reachable through approved remote terminal access; the optional GUI portal is never required to start the worker.

## Open decisions and assumptions

Select private-network, RustDesk relay, and device-enrollment topology for each private deployment.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
