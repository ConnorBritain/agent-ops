---
id: SPEC-009
status: draft
version: 0.1.0
audience: public-template
source: generalized-public-adaptation
dependencies: SPEC-006, SPEC-007
cross_references: SPEC-010, SPEC-016, SPEC-017
---

# SPEC-009: Hooks, Health and Safeguards

> This is a generalized public specification. Deployment-specific host, identity, network, and secret information belongs in a private implementation overlay.

## Purpose

Make host stewardship enforceable even when agents hang, drift, or create worktrees faster than they finish.

## Hook layers

Harness, worker, Coordinator, and independent periodic monitor hooks return audited ALLOW, WARN, BLOCK, REQUIRE_APPROVAL, REMEDIATE, or QUARANTINE_WORKER decisions.

## Resource and command guardrails

Workers check disk, worktree count, active work, CPU and memory pressure, log and temporary-data growth, stale sessions, orphan processes, and reboot state before risky actions. Periodic sweeps remain mandatory when an agent is hung.

## Remediation

The system warns and drains a worker, blocks new jobs, proposes safe cleanup, and can quarantine it. Cleanup defaults to dry-run and preserves active worktrees and session evidence.

## Normative requirements

| ID | Requirement | Evidence |
| --- | --- | --- |
| REQ-SAFE-001 | Worktree creation and provider launch obey configured free-disk and worktree-count limits. | Disk and worktree gate tests. |
| REQ-SAFE-002 | Health monitoring runs independently of agent turn completion. | Hung-agent monitor test. |
| REQ-SAFE-003 | Broad or recursive deletion is intercepted before execution and resolved to approved explicit targets. | Deletion-guard matrix. |
| REQ-SAFE-004 | Cleanup defaults to dry-run and preserves active evidence. | Cleanup dry-run test. |
| REQ-SAFE-005 | Stale sessions and orphaned processes create auditable health findings. | Orphan-process fixture. |
| REQ-SAFE-006 | A critical worker is drainable and quarantinable before additional dispatch. | Quarantine routing test. |
| REQ-SAFE-007 | Hook decisions record policy version, evidence, decision, and remediation outcome. | Hook-audit query. |

## Acceptance

Resource collapse, stale session, and unsafe delete fixtures yield blocks, evidence, and recoverable operator actions without harming a host.

## Open decisions and assumptions

Calibrate resource thresholds per approved worker class.

## Change control

Changes to requirement wording, public contracts, trust boundaries, or system-of-record ownership require a version update, cross-reference review, acceptance update, Roadmap update, and an ADR when architecture changes.
