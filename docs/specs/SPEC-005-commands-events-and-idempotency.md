---
id: SPEC-005
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: SPEC-004
cross_references: SPEC-006, SPEC-007, SPEC-008, SPEC-011
---

# SPEC-005: Commands, Events and Idempotency Contracts

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Specify typed intent, signed work, normalized observations, and reliable projection delivery.

## Commands

Natural language is parsed into a schema-validated command with actor, intent source, idempotency key, targets, required capabilities, and an optional provider preference. A command requests an authorized transition; it never directly means shell input.

## Job envelopes

A versioned job envelope carries task and run IDs, security domain, repository and worktree intent, capabilities, skills, policy envelope, lease, safe path scope, redaction policy, and callback identity.

## Events and delivery

Workers normalize observations into lifecycle, health, attention, artifact, verification, and outcome events. Internal state and outbox records write transactionally; projections deliver asynchronously with retry and dead-letter visibility.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-CONTRACT-001 | Intent validates against a versioned command schema before policy evaluation. | Invalid-command rejection test. |
| REQ-CONTRACT-002 | Dispatched jobs have versioned signed envelopes and expiring worker leases. | Signature and lease validation. |
| REQ-CONTRACT-003 | Events contain type, entity, source, event identity, occurrence time, ingestion time, and payload. | Event-schema test. |
| REQ-CONTRACT-004 | Event ingestion is idempotent on source and source event ID or equivalent key. | Duplicate-delivery test. |
| REQ-CONTRACT-005 | External projections use a transactional outbox with retry and dead-letter visibility. | Outbox retry test. |
| REQ-CONTRACT-006 | New contract versions declare backward-compatibility behavior. | Compatibility manifest review. |

## Acceptance

Duplicate worker events, stale leases, and retried attention delivery are handled without duplicate state or external output.

## Open decisions and assumptions

Select signing mechanism and JSON Schema or OpenAPI toolchain.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
