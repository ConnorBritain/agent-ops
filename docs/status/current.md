# Current status

## Phase 0 — governed public bootstrap

Status: **in progress** on `bootstrap/governed-scaffold`.

This slice establishes the public specification catalog, governance tooling, acceptance catalog, Roadmap, ADRs, TypeScript/pnpm policy, and public-data guard. It deliberately contains no Coordinator, worker, provider, database, host, credential, relay, or deployment implementation.

Evidence required before completion:

- `pnpm validate` passes.
- The generated specifications are current and sanitized.
- Roadmap validation and rendering succeed.
- The bootstrap pull request is scoped to governance only.
- The private `private-implementation` overlay is seeded independently with confidential source material.

Next slice: private host baseline and approved RustDesk enrollment planning. It is gated on owner authorization, a finalized relay/security design, and private-only configuration.
