# Known gaps

- Phase 0, the local durable core, and the transport-neutral worker supervisor
  are complete; no deployable Coordinator, worker service unit, provider
  launcher, or remote-access implementation exists yet.
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
- PrintProvider proves the lifecycle contract without launching anything. No
  real CLI provider has been selected, authenticated, installed by AgentOps,
  or exercised; the next research-only spike must choose a documented control
  surface before that execution adapter is designed.
- The public repository intentionally omits private source specifications, fleet inventory, network topology, and secret references beyond generic examples.
