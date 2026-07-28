# Contributing to AgentOps

AgentOps is a governed reference template. Before changing a slice, read `docs/specs/catalog.yaml`, `docs/status/current.md`, `docs/status/blockers.md`, the applicable specifications, and the matching Roadmap slice.

Every completed slice needs requirement mappings, executable evidence, Roadmap status, and any applicable ADRs. Models may propose; deterministic policy authorizes. Never add credentials, real host inventory, customer data, or deployment state to this public repository.

Run `pnpm validate` before opening a pull request. Architectural changes require an ADR and a specification/acceptance update.
