# Initial Codex App Server provider boundary

`codex-app-server` is the selected first provider protocol, implemented only in
the following Roadmap slice. It is a local child process speaking JSON-RPC over
stdio, never a listener, scheduler, authority, or durable state store.

```text
authorized ProviderInvocation
  -> local stdio JSON-RPC port
  -> initialize -> thread/start -> turn/start
  -> normalized provider observations
  -> future durable event ingestion
```

The adapter may use `turn/steer` for active-turn human input, `thread/read` for
inspection, and `turn/interrupt` for cancellation. It explicitly declares
pause/resume unsupported. It has no raw shell-input, remote-desktop, WebSocket,
or inline-secret path.

`ScriptedJsonRpcTransport` is the deterministic test double. Tests must prove
that each request is ordered and correlated, unknown or secret-bearing protocol
output is rejected, cancellation produces evidence without restart, and the
adapter does not promote a provider event directly into task or run state.
