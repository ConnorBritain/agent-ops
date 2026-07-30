# Future TypeScript monorepo boundaries

Phase 0 created no runtime packages. Phase 2 activated the contract, domain,
adapter, and Supabase boundaries. Phase 3 adds a transport-neutral worker
supervisor, deterministic safety policy and monitor, and test kit, but no
application service, provider launcher, host enrollment, credential, or cloud
deployment.

| Future location | Responsibility | Must not own |
| --- | --- | --- |
| `apps/coordinator` | Intent, policy orchestration, scheduling, reconciliation, attention, and durable state transitions. | Direct host control or unreviewed external state writes. |
| `apps/worker` | Future host-service composition root for outbound connectivity and platform adapters. | Domain policy, provider implementation, portfolio priority, or autonomous restart decisions. |
| `packages/contracts` | Versioned command, job, event, provider, verification, and remote-access contracts. | I/O, credentials, or current operational state. |
| `packages/domain` | Pure state machines, scheduling constraints, policy inputs, and lineage rules. | Network, database, process, or provider APIs. |
| `packages/worker` | Transport-neutral registration, heartbeat, admission, resource reservation, cancellation, reboot-idle supervisor, and externally invoked safety-audit application. | Service-manager installation, timers, inbound control, provider launch, credentials, host mutation, or automatic workload recovery. |
| `packages/policy` | Deterministic authorization, resource, destructive-delete, dry-run cleanup, and safety decisions. | Natural-language authority, secret storage, command execution, process control, or filesystem deletion. |
| `packages/provider-sdk` | Provider lifecycle port and capability semantics. | Coordinator state mutation. |
| `packages/adapters` | Supabase, Roadmap, chat, portfolio, GitHub, memory, and RustDesk adapter implementations. | Domain ownership outside their explicit port. |
| `packages/test-kit` | Deterministic clocks, resources, control-plane recordings, fixtures, contract suites, and acceptance harnesses. | Production credentials or host inventory. |
| `supabase` | Append-only migrations, local configuration, database policy definitions, and pgTAP tests. | Runtime secrets or hosted-project identifiers. |
| `config/fleet` | Public schemas and generic examples. | Real host, relay, network, or credential values. |

No generated package directory is committed before its owning Roadmap slice is
active. Service composition and provider execution remain later slices.
