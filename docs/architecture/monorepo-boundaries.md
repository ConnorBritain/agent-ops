# Future TypeScript monorepo boundaries

Phase 0 created no runtime packages. Phase 2 activates only the contract,
domain, adapter, and Supabase boundaries described here; applications and host
services remain later slices.

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
| `supabase` | Append-only migrations, local configuration, database policy definitions, and pgTAP tests. | Runtime secrets or hosted-project identifiers. |
| `config/fleet` | Public schemas and generic examples. | Real host, relay, network, or credential values. |

No generated package directory is committed before its owning Roadmap slice is
active. Phase 2 is the first active implementation slice.
