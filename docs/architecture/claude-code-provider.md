# Claude Code print-mode provider boundary

`claude-code` is AgentOps' second normalized CLI-provider adapter. It is an
injected local-stdio boundary over Claude Code's documented non-interactive
print mode and JSONL output; it is not a listener, scheduler, authority,
durable store, remote-control endpoint, or source of task/run state.

```text
authorized ProviderInvocation
  -> injected local stdio port
  -> claude --bare --print --output-format stream-json
  -> normalized provider observations
  -> future durable event ingestion
```

The public source asks its injected factory for a single launch intent with:

- `--bare`, so hooks, plugins, MCP servers, automatic memory, and project
  instructions are not silently inherited;
- `--print` and `--output-format stream-json`, for a documented bounded
  non-interactive event stream;
- `--no-session-persistence`, so the adapter never relies on a resumable local
  conversation;
- `--permission-mode dontAsk`, so unapproved provider actions are refused
  rather than prompting through an unattended flow;
- policy-supplied model, maximum-turn, and USD-budget values.

The adapter never applies `--continue`, `--resume`, `--remote`, remote control,
an auto-approval flag, a raw credential environment value, or a generic tool
allowlist. The initial prompt is bounded and secret-safe at the provider
contract boundary. The future private stdio binding chooses its own reviewed
prompt transport; this public package deliberately has no child-process
launcher, authentication binding, installed CLI assumption, or network path.

Lifecycle mapping:

| AgentOps lifecycle | Claude Code print-mode boundary | Behavior |
| --- | --- | --- |
| capability inspection | Manifest declares `terminal` and `git` capability. | Provider selection remains capability-first. |
| environment validation | Validate a semver protocol report, approved local executable reference, local stdio, stream JSON, disabled session persistence, and `dontAsk`. | Does not read credentials. |
| start | Create one injected session and require a minimized `system/init` event. | Correlates only session and model identifiers. |
| send input | Unsupported. | One-shot print mode cannot be silently continued. |
| inspect | Reduce a known JSONL event class to `running`, `complete`, `failed`, or `attention`. | Excludes response text, tool data, cost, usage, and transcript. |
| pause and resume | Unsupported. | No process suspension or session resumption is implied. |
| cancel | Request local port termination for an active session. | Emits cancellation evidence and never restarts. |
| collect artifacts | Return bounded session metadata only. | Excludes prompt, transcript, auth state, cost, and usage. |

`ScriptedClaudeCodeSession` is the deterministic fixture. The conformance,
terminal-result, malformed/secret-event, unavailable-session, cancellation,
and preflight tests run without a Claude binary, a provider account, a
credential, a process, a network connection, or a host change. A real local
binding requires a separate private, owner-authorized disposable canary with a
scoped identity, budget decision, provider-version verification, rollback, and
redacted evidence.
