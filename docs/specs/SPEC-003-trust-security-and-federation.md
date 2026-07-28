---
id: SPEC-003
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: SPEC-000
cross_references: SPEC-004, SPEC-007, SPEC-010, SPEC-019
---

# SPEC-003: Trust, Security and Federation Model

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Establish hard trust boundaries before dispatching agents across workers and remote-access sessions.

## Security domains

Tasks, repositories, credential references, artifacts, transcripts, memory namespaces, and browser sessions carry a security-domain label. A mismatch is a scheduling rejection, never a cost or performance tradeoff.

## Identity and secrets

Human, Coordinator, worker, and external-integration identities are distinct. Workers authenticate outbound with scoped identities. Secret values stay in an approved secret store; operational state stores references and metadata only.

## High-risk controls

Destructive data commands, production changes, access changes, force pushes, purchases, irreversible browser submissions, unbounded deletes, merges, and federation transitions require explicit recorded policy authorization.

## Federation

A restricted domain needs separate credentials, logs, memory namespace, provider configuration, and a sanitizing status protocol before any approved federation. Personal services cannot retrieve restricted source, secrets, sessions, or private memory by default.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-SEC-001 | Every schedulable object carries a security-domain label. | Domain-label schema test. |
| REQ-SEC-002 | A domain mismatch is rejected before scoring or provider selection. | Cross-domain routing test. |
| REQ-SEC-003 | Secret values never persist in operational state or public projections. | Redaction fixture. |
| REQ-SEC-004 | Workers use scoped outbound identities and do not receive broad service credentials. | Credential-scope review. |
| REQ-SEC-005 | High-risk actions require a recorded policy decision before execution. | Approval negative tests. |
| REQ-SEC-006 | Federation remains disabled until an approved ADR and sanitizing boundary exist. | Federation gate review. |

## Acceptance

Negative tests reject cross-domain dispatch, redact a representative attention event, and block destructive action without approval.

## Open decisions and assumptions

Select the approved federation protocol and status-redaction policy.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
