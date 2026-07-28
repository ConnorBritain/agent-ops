# Future TypeScript monorepo boundaries

Phase 0 creates no runtime packages. This document fixes the boundaries that future slices must respect.

| Future location | Responsibility | Must not own |
| --- | --- | --- |
| `apps/coordinator` | Intent, policy orchestration, scheduling, reconciliation, attention, and durable state transitions. | Direct host control or unreviewed external state writes. |
| `apps/worker` | Outbound lease client, local preflight, process supervision, health collection, and normalized observations. | Portfolio priority, policy exceptions, or autonomous restart decisions. |
| `packages/contracts` | Versioned command, job, event, provider, verification, and remote-access contracts. | I/O, credentials, or current operational state. |
| `packages/domain` | Pure state machines, scheduling constraints, policy inputs, and lineage rules. | Network, database, process, or provider APIs. |
| `packages/policy` | Deterministic authorization and safety decisions. | Natural-language authority or secret storage. |
| `packages/provider-sdk` | Provider lifecycle port and capability semantics. | Coordinator state mutation. |
| `packages/adapters` | Supabase, Roadmap, chat, portfolio, GitHub, memory, and RustDesk adapter implementations. | Domain ownership outside their explicit port. |
| `packages/testkit` | Deterministic fakes, fixtures, contract suites, and acceptance harnesses. | Production credentials or host inventory. |
| `infra/supabase` | Append-only migrations and database policy definitions. | Runtime secrets. |
| `config/fleet` | Public schemas and generic examples. | Real host, relay, network, or credential values. |

No generated package directory is committed until its owning Roadmap slice is ready. This prevents Phase 0 governance work from being misrepresented as a runtime implementation.
