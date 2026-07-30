# Current status

## Phase 0 — governed public bootstrap

Status: **complete** on 2026-07-28.

This slice established the public specification catalog, governance tooling, acceptance catalog, Roadmap, ADRs, TypeScript/pnpm policy, public-data guard, and private-overlay boundary. It deliberately added no Coordinator, worker, provider, database, host, credential, relay, or deployment implementation.

Completion evidence:

- Public bootstrap pull request #1 merged to `main`.
- Public GitHub Actions governance validation passed.
- The generated specifications are current, sanitized, and public-data guarded.
- Roadmap validation and rendering succeed.
- The private implementation overlay was seeded independently from the merged public baseline and its private validation passed.

Private host baseline and RustDesk enrollment remain a separately gated
private-overlay workstream requiring owner authorization, a finalized
relay/security design, and private-only configuration.

## Phase 2 — durable operational core

Status: **local implementation complete** on 2026-07-29; hosted verification is gated.

The generalized implementation was completed independently of any private host
or cloud project. The local slice adds versioned TypeScript contracts, pure
placement/reconciliation rules, a transport-neutral Supabase adapter, explicit
Postgres schemas, RLS, an append-only event log, transactional outbox,
database-timed Coordinator leases, fencing-token enforcement, and local pgTAP
acceptance tests.

Completion evidence:

- Governance, generated views, TypeScript, and unit validation pass.
- A fresh ephemeral Supabase stack applies the migration and passes the pgTAP
  authorization, lineage, fencing, idempotency, outbox, and recovery suites.
- Database lint passes for all durable schemas.
- Review findings covering stale leaders, worker spoofing, abandoned outbox
  locks, idempotency collisions, secret guards, and reconciliation drift are
  incorporated in the validated implementation.

This work created no remote project, credential, Coordinator process, worker
process, provider session, or deployment. Applying the migration to a hosted
project remains the separately authorized `supabase-remote-verification`
private-overlay gate.

## Ordered v1 implementation

Status: **Phase 3 worker core is complete; safety hooks are next** as of
2026-07-30.

The Roadmap now represents the complete normative rollout from the local
durable foundation through worker safety, Roadmap composition, PrintProvider,
two CLI providers, the first attention-and-verified-delivery vertical slice,
external projections, skills and FinOps, release recovery, observed browser
support, optional curated memory, and separately authorized federation.

The durable core is an executable foundation, not the first completed product
vertical slice. `REQ-BUILD-003` and `REQ-ROLL-002` remain planned against
`verified-draft-delivery`, which must prove the complete attention-and-delivery
loop before broader automation is considered complete.

Every one of the 130 normative requirements now has an enforced primary
requirement-to-slice-to-acceptance-to-test mapping in
`docs/traceability/v1-requirements.yaml`. Future evidence is labeled planned or
gated rather than being inferred from code existence.

## Phase 3 — worker runtime core

Status: **local worker core complete** on 2026-07-30; host service packaging
and enrollment are not started.

The transport-neutral `packages/worker` supervisor now starts idle, registers a
versioned capability/skill manifest, publishes sequenced heartbeats and
normalized lifecycle/health events, and exposes bounded admission,
inspection, and cancellation paths. Its pure preflight decision rejects
unverified policy or signatures, expired or mismatched leases, domain/path
mismatches, missing capabilities or skills, missing or excessive resource
budgets, disk/memory/worktree pressure, and job-capacity overcommit before any
provider can start.

Deterministic fixtures prove duplicate accepted envelopes create no duplicate
lifecycle event, reservations are accounted before another admission, inline
secrets are rejected, and supervisor startup restores no workload. The package
intentionally has no inbound listener, provider launcher, service-manager
definition, host identity, secret, or remote connection.

Next slice: `worker-safety-hooks` adds independent resource/process/worktree
collectors, unsafe-delete interception, dry-run cleanup, drain, quarantine, and
hung-agent monitoring. `REQ-WORKER-001`, `REQ-WORKER-005`, real cryptographic
verification, scoped runtime identity, and private canary evidence remain
planned or gated rather than inferred from the local supervisor.
