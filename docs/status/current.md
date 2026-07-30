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

Active public slice: the Phase 2 durable operational core described below. Private host baseline and RustDesk enrollment remain a separately gated private-overlay workstream requiring owner authorization, a finalized relay/security design, and private-only configuration.

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
