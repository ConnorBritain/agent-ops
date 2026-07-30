# AgentOps

AgentOps is a provider-neutral, policy-governed architecture for supervising bounded coding-agent work across a fleet of approved workers.

The public repository is a clean reference implementation and governance template. It contains no private host inventory, credentials, deployment configuration, or production infrastructure.

The governed bootstrap and local durable operational core are complete. The
full specification-ordered v1 Roadmap is tracked in `docs/SLICES.md`, and the
generated requirement-to-slice-to-test report is in
`docs/traceability/v1-requirements.yaml`.

Run `pnpm validate` for specifications, traceability, public-data policy,
Supabase migration structure, TypeScript, unit tests, and Roadmap validation.
Database acceptance additionally uses `pnpm db:start:minimal`,
`pnpm test:db`, and `pnpm db:lint`.
