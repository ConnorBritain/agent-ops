# Future TypeScript monorepo boundaries

Phase 0 created no runtime packages. Phase 2 activated the contract, domain,
adapter, and Supabase boundaries. Phase 3 adds a transport-neutral worker
supervisor, deterministic safety policy and monitor, and test kit. Phase 4
adds the shared provider SDK and a deterministic `PrintProvider` test double.
Phase 6 adds a transport-neutral Coordinator application service, a
secret-reference-only Slack Socket Mode attention adapter, and replayable
independent-verification/draft-delivery ports over durable interfaces; none
has a listener, real provider launcher, host enrollment, credential, cloud
deployment, or external GitHub binding. Phase 7 adds a second normalized CLI
adapter through the same provider SDK and deterministic GitHub/portfolio
outbox-projection contracts; both remain injected fixture boundaries.

| Future location | Responsibility | Must not own |
| --- | --- | --- |
| `apps/coordinator` | Intent persistence, policy orchestration, scheduling audit, durable-job dispatch, reconciliation, and attention ordering over named ports. | Direct host control, a listener, timer, provider launch, chat authority, or unreviewed external state writes. |
| `apps/worker` | Future host-service composition root for outbound connectivity and platform adapters. | Domain policy, provider implementation, portfolio priority, or autonomous restart decisions. |
| `packages/contracts` | Versioned command, job, event, provider, verification, external-projection, and remote-access contracts. | I/O, credentials, or current operational state. |
| `packages/domain` | Pure state machines, scheduling constraints, policy inputs, lineage rules, and durable outbox ports. | Network, database, process, or provider APIs. |
| `packages/worker` | Transport-neutral registration, heartbeat, admission, resource reservation, cancellation, reboot-idle supervisor, and externally invoked safety-audit application. | Service-manager installation, timers, inbound control, provider launch, credentials, host mutation, or automatic workload recovery. |
| `packages/policy` | Deterministic authorization, resource, destructive-delete, dry-run cleanup, and safety decisions. | Natural-language authority, secret storage, command execution, process control, or filesystem deletion. |
| `packages/provider-sdk` | Typed provider lifecycle port, capability-only routing, observation normalization, and shared conformance harness. | Coordinator state mutation, process control, credentials, or vendor selection without explicit human preference. |
| `packages/providers/print` | Deterministic no-execution provider that emits sealed, redacted plans and test artifacts for every lifecycle operation. | Process execution, shell access, provider-session creation, task/run mutation, or secret rendering. |
| `packages/providers/codex-app-server` | Injected local-stdio JSON-RPC adapter for one bounded Codex App Server session. | A child-process binding, listener, credential handling, direct state mutation, or automatic restart. |
| `packages/providers/claude-code` | Injected local-stdio, bounded Claude Code print-mode/JSONL adapter. | A child-process binding, remote control, generic tool auto-approval, credential handling, direct state mutation, or automatic restart. |
| `packages/adapters` | Supabase, Roadmap, Slack attention, independent verification/draft-delivery, and deterministic GitHub/portfolio projection adapters. | Domain ownership outside their explicit port, a Slack connection/listener, Slack-derived Scheduler/provider authority, GitHub merge/release/deployment behavior, a generic external write, or unreviewed external calls. |
| `packages/test-kit` | Deterministic clocks, resources, control-plane recordings, fixtures, contract suites, and acceptance harnesses. | Production credentials or host inventory. |
| `deploy/worker-supervisor` | Versioned service-manager templates and read-only clean-host verification scripts. | Installation, account creation, artifact download, service activation, or workload restart. |
| `supabase` | Append-only migrations, local configuration, database policy definitions, and pgTAP tests. | Runtime secrets or hosted-project identifiers. |
| `config/fleet` | Public schemas and generic examples. | Real host, relay, network, or credential values. |

No generated package directory is committed before its owning Roadmap slice is
active. Hosted service composition and real provider execution remain later
separately authorized slices.

The Roadmap adapter depends on the separately versioned read-only protocol in
`config/roadmap-adapter.manifest.yaml`; it consumes Roadmap's readiness and
worktree intent but does not recreate the repository graph.
