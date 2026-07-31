# Known gaps

- Phase 0, the local durable core, transport-neutral worker supervisor, and
  Coordinator application service are complete. There is still no deployable
  Coordinator composition root, worker service installation, provider launcher,
  or remote-access implementation.
- RustDesk is represented only as a constrained architecture contract; there is no relay deployment, endpoint, enrollment, or credential material.
- Durable-core, worker, safety, and static service fixtures cover local
  authority, admission, resource refusal, dry-run remediation, audit, and
  reboot-idle packaging boundaries. Provider launch, actual signature
  verification, actual service installation, durable attention routing, and
  full end-to-end fixtures remain future work.
- The Roadmap read adapter resolves only ready-wave and worktree intent. It
  does not create worktrees, launch agents, mutate Roadmap, or satisfy the
  remaining independently versioned primitive, estimator, and architecture
  dependency references.
- PrintProvider proves the lifecycle contract without launching anything. The
  first Codex App Server adapter now proves its injected protocol boundary,
  crash handling, cancellation, and redacted artifacts with deterministic test
  doubles only. No real CLI provider has been authenticated, installed by
  AgentOps, launched, or exercised; the host-specific local-stdio binding and
  disposable runtime canary remain private, separately authorized work.
- The Coordinator owns durable ordering and reconciliation decisions but has no
  hosted durable-store binding, timer, scoped runtime identity, worker transport,
  chat projection, or delivery outbox runner. A provider acknowledgement is
  deliberately insufficient to report a run as executing.
- The public repository intentionally omits private source specifications, fleet inventory, network topology, and secret references beyond generic examples.
