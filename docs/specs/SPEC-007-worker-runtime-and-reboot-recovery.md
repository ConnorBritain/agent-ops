---
id: SPEC-007
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: SPEC-005, SPEC-006
cross_references: SPEC-009, SPEC-010, SPEC-015, SPEC-019
---

# SPEC-007: Worker Runtime and Reboot Recovery

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Specify a small outbound worker supervisor that makes a host a recoverable execution node while retaining recovery authority in the Coordinator.

## Responsibilities

A worker registers, reports a versioned capability and skill manifest, sends heartbeats, validates leased jobs, starts and observes local provider processes, emits normalized events, collects artifacts, applies safety hooks, and handles cancellation.

## Boot and restart

The supervisor starts after boot without user login, restores connectivity, reports health, and remains idle. It never restarts an agent solely because the operating system restarted; the Coordinator decides whether prior work is resumable, stale, cancelled, or needs attention.

## Local validation

Before launch, the worker validates domain, capabilities, skills, path scope, resource budget, tools, credential references, and lease validity. Failure returns a structured rejection rather than partial execution.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-WORKER-001 | The worker supervisor starts and registers after reboot without user login. | Reboot-and-register test. |
| REQ-WORKER-002 | Workers validate compatibility, policy envelope, resource budget, and lease before launch. | Preflight rejection matrix. |
| REQ-WORKER-003 | Workers report a versioned capability and skill manifest. | Manifest conformance test. |
| REQ-WORKER-004 | Workers emit normalized lifecycle and health events with idempotency identifiers. | Event-client test. |
| REQ-WORKER-005 | Agent processes do not blindly restart after host boot. | Post-reboot no-auto-resume test. |
| REQ-WORKER-006 | Workers expose safe cancellation and inspection paths. | Cancellation recovery test. |

## Acceptance

A rebooted worker reports health, accepts a harmless valid job, and rejects expired or resource-incompatible work.

## Open decisions and assumptions

Select service managers for the supported host operating systems.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
