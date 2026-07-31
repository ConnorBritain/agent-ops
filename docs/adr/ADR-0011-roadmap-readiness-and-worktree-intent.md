# ADR-0011: Roadmap readiness and worktree intent

Status: accepted

Roadmap owns repository-local dependency ordering, ready waves, gates, branch
names, and worktree intent. AgentOps consumes the read-only `plan` and `show`
MCP tools through a typed transport; it neither parses `roadmap.yaml` nor
reimplements its graph, creates a worktree, launches an agent, or writes back
to Roadmap.

The adapter validates the external payload and rejects secret-bearing,
non-ready, gated, blocked, or internally mismatched responses. Its result
retains the requested correlation, task, run, security-domain, stable slice,
branch, and worktree reference. `preparation: not-started` is a deliberate
intent marker: actual worktree preparation remains a separately authorized
Roadmap operation, and agent launch remains outside this adapter.

The Roadmap package and read protocol are versioned in
`config/roadmap-adapter.manifest.yaml`. Future primitives, estimation, and
architecture integrations must declare their own independently versioned
references rather than coupling their dependency graphs to this adapter.
