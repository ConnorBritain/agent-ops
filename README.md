# AgentOps

AgentOps is a provider-neutral, policy-governed architecture for supervising bounded coding-agent work across a fleet of approved workers.

The public repository is a clean reference implementation and governance template. It contains no private host inventory, credentials, deployment configuration, or production infrastructure.

The governed bootstrap, local durable operational core, transport-neutral
worker supervisor, policy-only safety hooks, static cross-platform service
packaging, read-only Roadmap readiness/worktree-intent adapter, and
no-execution provider conformance baseline are complete. `PrintProvider`
records redacted sealed plans but cannot start a process. The full
specification-ordered v1 Roadmap is
tracked in `docs/SLICES.md`, and the generated
requirement-to-slice-to-acceptance-to-test report is in
`docs/traceability/v1-requirements.yaml`. No host service or provider runtime
is installed by this repository. The next slice is a documented first
CLI-provider selection spike; it is not authorization to install,
authenticate, or run a provider.

Run `pnpm validate` for specifications, traceability, public-data policy,
Supabase migration structure, TypeScript, unit tests, and Roadmap validation.
Database acceptance additionally uses `pnpm db:start:minimal`,
`pnpm test:db`, and `pnpm db:lint`.
