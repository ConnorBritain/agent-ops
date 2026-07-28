---
id: SPEC-013
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: SPEC-004, SPEC-011
cross_references: SPEC-012, SPEC-016, SPEC-018
---

# SPEC-013: Estimation, FinOps and Planning Feedback

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Measure consumption and delivery outcomes so planning improves without confusing accounting, telemetry, and quality.

## Estimation

An independent transparent estimator predicts agent-native rounds and low, expected, and high wall-clock ranges, supports re-estimation, and calibrates from outcomes. Agent execution, wall clock, human attention, blocked time, verification, provider, worker, risk, and outcome remain distinct.

## Cost model

Accounting remains source of truth for invoices and transactions. AgentOps records usage, pools, subscriptions, rate cards, allocation methods, and task attribution. Direct, fully loaded, human-inclusive, and failure-adjusted costs are distinct and versioned.

## Planning feedback

Observed delivery links to portfolio context and acceptance results. AgentOps can learn correlations between estimates, effort, duration, retries, cost, acceptance, and reopen rate without silently redefining relative planning points as money.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-FINOPS-001 | Estimates retain ranges, basis, model, and calibration history. | Estimate lineage test. |
| REQ-FINOPS-002 | Agent, human, blocked, and verification time remain separate measures. | Time-accounting fixture. |
| REQ-FINOPS-003 | Rate cards and allocation methods are versioned rather than hardcoded in prompts. | Rate-card review. |
| REQ-FINOPS-004 | Cost records trace to task and applicable run. | Allocation lineage query. |
| REQ-FINOPS-005 | Accounting transactions remain outside AgentOps operational truth. | System-of-record review. |
| REQ-FINOPS-006 | Planning feedback does not silently convert relative points to currency. | Projection contract test. |

## Acceptance

One accepted task has traceable estimate, observed time, human attention, direct cost, fixed-cost allocation, and a linked planning record.

## Open decisions and assumptions

Select initial rate-card import and allocation defaults.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
