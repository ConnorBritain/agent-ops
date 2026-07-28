---
id: BUILD-001
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: CAT-001, SPEC-000 through SPEC-019
cross_references: CAT-001, SPEC-000 through SPEC-019
---

# BUILD-001: Initial AgentOps Implementation Prompt

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Provide a durable starting instruction for a governed implementation session while specifications, acceptance contracts, Roadmap, and ADRs remain authoritative.

## Mission

Build a portable provider-neutral operating system that lets a human supervise bounded coding-agent work across approved personal workers. Compose the Roadmap, portable primitives, and independent estimator rather than recreating their authority.

## Non-negotiable governance

Read the catalog and relevant specifications before a slice. Completion requires implementation, tests, requirement mappings, Roadmap status, and ADR agreement. Models propose while policy authorizes; domains are hard filters; provider selection is capability based; durable state is not chat; external failures cannot corrupt core state.

## Work cycle

At the start, inspect catalog, status, blockers, applicable specs, Roadmap readiness, dependencies, estimate, intended implementation, tests, and risks. At the end, run relevant tests, validate Roadmap, update mappings and status, record gaps honestly, and hand off evidence and next slice.

## Initial delivery order

First create only repository governance scaffolding, specifications, ADRs, acceptance catalog, Roadmap, and validation. Do not mutate hosts or deploy production infrastructure in the bootstrap pull request. Build later vertical slices only in the documented rollout order.

## Stop conditions

Stop for conflicting specifications, destructive migration or production change, unclear security boundary, missing credentials or external authorization, unsafe undocumented automation, unsafe host, or restricted-domain authority. Otherwise continue through the Roadmap.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-BUILD-001 | An implementation session reads catalog and applicable specifications before beginning a slice. | Cycle checklist evidence. |
| REQ-BUILD-002 | The bootstrap pull request contains governance scaffolding only and does not mutate hosts or production infrastructure. | PR scope review. |
| REQ-BUILD-003 | The first executable vertical slice proves the attention-and-delivery loop before broader automation. | End-to-end v1 scenario. |
| REQ-BUILD-004 | The implementation session stops for authorization, destructive-action, boundary, and unsafe-automation conditions. | Blocked-decision record. |
| REQ-BUILD-005 | No Roadmap slice is complete on code existence alone. | Traceability gate. |

## Acceptance

A fresh implementation session can create a governed bootstrap and keep subsequent work aligned with normative specifications.

## Open decisions and assumptions

Revise only through the same specification and ADR change-control process.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
