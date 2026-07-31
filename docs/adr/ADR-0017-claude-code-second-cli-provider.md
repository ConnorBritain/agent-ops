# ADR-0017: Use bounded Claude Code print mode as the second CLI provider

Status: accepted

## Context

AgentOps needs two independent normalized CLI adapters to demonstrate that
provider selection stays capability-based and vendor-specific lifecycle details
do not leak into commands, jobs, task state, or Coordinator authority. The
second adapter must retain the established safety boundaries: injected local
stdio only, no listener or UI automation, explicit operation support, redacted
evidence, no automatic restart, and no runtime credential or host changes.

ADR-0013 retained Claude Code as the preferred independent second-provider
candidate. Its current official documentation describes non-interactive print
mode, structured `stream-json` output, bounded turns and budget, disabled
session persistence, and a `dontAsk` permission mode. The public source
adapts only that documented surface; it does not assert that any account,
model, entitlement, or real binary is available.

Sources reviewed 2026-07-30:

- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-usage)
- [Claude Code programmatic/headless guide](https://code.claude.com/docs/en/headless)

## Decision

Use `claude-code` as the second normalized provider with this injected launch
intent:

```text
claude --bare --print --output-format stream-json --no-session-persistence \
  --permission-mode dontAsk --max-turns <policy-bound> \
  --max-budget-usd <policy-bound> --model <policy-approved>
```

The launch is represented only as data passed to a narrow session factory. The
public repository has no launcher, stdin binding, credential mechanism,
provider installation, external socket, remote control, or server process.
The adapter validates the factory's local-only protocol report before work and
requires a safe `system/init` record before reporting a running session.

Lifecycle mapping:

| AgentOps lifecycle | Claude Code boundary | Decision |
| --- | --- | --- |
| start | one print-mode session with `stream-json` output | supported |
| send input | no same-session continuation in this one-shot profile | unsupported |
| inspect | normalize known stream event classes and terminal result | supported |
| pause / resume | no process suspension or session resume | unsupported |
| cancel | injected local-port termination | supported |
| artifacts | minimized session/model/status metadata | supported |

The adapter does not use `--continue`, `--resume`, `--remote`, remote control,
permission bypass, `--allowedTools`, raw API-key assignment, or a generic
auto-approval setting. It is therefore an intentionally bounded second
provider rather than a mechanism for unattended desktop control or a generic
agent launcher.

## Consequences

- `PrintProvider`, `codex-app-server`, and `claude-code` pass the same common
  lifecycle and observation-normalization suite while retaining truthful
  operation declarations.
- The generic contracts remain vendor-neutral. A human may state a provider
  preference only after normal capability and policy filtering.
- The CLI's model, authentication, current protocol compatibility, spend,
  installed version, and usable permission profile are not assumed by this
  ADR. They require a future private disposable-runtime canary and explicit
  owner authorization.
- This decision creates source and deterministic fixtures only. It does not
  authorize a provider download, sign-in, process launch, remote session,
  host configuration, external request, or paid consumption.
