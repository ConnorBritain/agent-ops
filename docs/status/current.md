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

Next slice: private host baseline and approved RustDesk enrollment planning. It is gated on owner authorization, a finalized relay/security design, and private-only configuration.

## Phase 2 — durable operational core

Status: **in progress**.

The generalized implementation now begins independently of any private host or
cloud project. The active slice adds versioned TypeScript contracts, pure
placement/reconciliation rules, a transport-neutral Supabase adapter, explicit
Postgres schemas, RLS, an append-only event log, transactional outbox,
database-timed Coordinator leases, fencing-token enforcement, and local pgTAP
acceptance tests.

This work creates no remote project, credential, Coordinator process, worker
process, provider session, or deployment. Applying the migration to a hosted
project remains a separate, private-overlay gate.
