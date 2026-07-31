# Initial Codex App Server provider boundary

`codex-app-server` is the selected first provider protocol. Its public adapter
is an injected local-stdio JSON-RPC binding, never a listener, scheduler,
authority, or durable state store. The repository intentionally contains no
concrete child-process launcher, authentication binding, or installed CLI
assumption.

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

## Implemented adapter boundary

`CodexAppServerProvider` accepts a `CodexAppServerSessionFactory` port. A
future private worker may bind that port to exactly one local child process per
authorized invocation; the public adapter only requests this launch intent:

```text
codex app-server --listen stdio://
```

The factory first reports a semver protocol version, an
`approved-local:*` executable reference, and `localStdioOnly: true`. The
adapter rejects any other preflight result without reading credential material.
For a valid invocation, it orders `initialize`, the required `initialized`
notification, `thread/start`, and `turn/start`; input uses `turn/steer`,
inspection uses `thread/read`, and cancellation uses `turn/interrupt`. The
provider receives a policy-approved model identifier explicitly rather than
silently choosing one. Pause and resume remain honestly unsupported.

The provider-specific inputs are intentionally narrow: `start` accepts exactly
`{ prompt }` and active-turn input accepts exactly `{ message }`. It does not
relay the signed job envelope body, callback reference, signature, or raw
transcript into protocol evidence. Returned protocol objects are checked for
inline secrets and then reduced to safe thread/turn identifiers and a known
thread status. Unknown shapes or statuses are refused.

On a transport error the adapter emits a correlated `attention` observation,
retains bounded session metadata for artifact collection, and marks automatic
restart disabled. It cannot turn that observation into task or run state, and
it will reject an attempt to reuse the same invocation as a restart. Artifact
collection records only protocol identity, thread/turn references, terminal
state, interruption evidence, and explicit exclusions for transcript and
authentication state.

The deterministic conformance, malformed-output, crash, cancellation, and
redaction fixtures prove this boundary without launching a binary, connecting a
network socket, creating credentials, or changing a host. A real disposable
provider canary is a separate private, owner-authorized gate.
