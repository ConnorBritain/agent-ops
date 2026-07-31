# Slack Socket Mode attention adapter boundary

`SlackSocketModeAttentionAdapter` is a deterministic, transport-neutral
attention projection and ingress adapter in `packages/adapters`. It has no
Slack SDK, WebSocket client, listener, timer, environment-variable read, or
network dependency. A separately authorized private composition root may bind
the typed ports to a Slack app, secret store, durable outbox, and Coordinator.

Socket Mode is the intended future transport because Slack uses a runtime
WebSocket URL rather than a public request URL. Socket envelopes have an
`envelope_id` and must be acknowledged; Slack documents that individual events
arriving over this pre-authenticated connection do not use the HTTP
request-signature verification pattern. See Slack's [Socket Mode guide](https://docs.slack.dev/apis/events-api/using-socket-mode/)
and [`apps.connections.open`](https://docs.slack.dev/reference/methods/apps.connections.open/).

## Authority and configuration

The configuration accepts only:

```ts
{
  appId: "A-GENERIC-EXAMPLE",
  appTokenRef: "secret://agentops/slack/app-token",
  botTokenRef: "secret://agentops/slack/bot-token",
  socketMode: true,
  publicHttpIngress: false,
}
```

It rejects inline token values, a signing-secret field, public HTTP ingress,
and unrecognized configuration. The adapter does not read secret values. A
private overlay may supply approved references, but must never commit values.

Slack's authenticated connection is not enough to create AgentOps authority.
For every safe inbound envelope, `SlackWorkspaceActorAuthorizer` resolves the
workspace and external Slack actor to an authorized internal human principal
and security domain. The adapter rejects unknown workspaces, actors, and domain
mappings. It cannot create a job, mutate task or run state, dispatch a worker,
or start/resume a provider; only the Coordinator-owned command port can record
an accepted command.

## Ingress ordering and retry behavior

```text
raw Socket envelope
  -> sanitize (discard token, response URL, trigger/channel/display fields)
  -> durable SlackIngressStore.reserve(envelope ID)
  -> workspace + actor authorization
  -> Coordinator command port returns "durably-recorded"
  -> durable SlackIngressStore.complete
  -> Socket acknowledgement
```

The receipt is reserved before authorization and command handling. A duplicate
completed envelope is acknowledged but is not processed a second time. If the
Coordinator command port fails, the receipt remains pending and the adapter
does not acknowledge it, allowing Slack delivery retry to reuse the same
idempotency key. The durable Coordinator already persists an attention answer
before attempting any response projection.

Only two bounded commands are recognized in this slice:

- `/agentops answer <attention-item UUID> <answer>` becomes an
  `AnswerAttentionItem` command with a secret-safe durable response.
- `/agentops inspect <run UUID>` becomes an `InspectRun` command.

The interactive `agentops.answer-attention` action maps to the same durable
answer contract. Authentication text is rejected: authentication remains an
out-of-band, authorized provider flow and is never collected in chat.

## Attention projection

An attention item becomes an `attention-summary` message first. If it contains
a `verbatimQuestion`, the adapter creates a separate `exact-worker-question`
message for an independently resolved, domain-scoped audience. The summary
never embeds the exact question. An authentication attention carries only an
`out-of-band-authorized-provider-flow` handoff marker, never a credential,
link, or token.

The adapter projects an answer only as `attention-response-recorded`; it never
echoes the answer body back to chat or claims that a worker resumed. A later
Coordinator-owned worker-session projection handles durable response delivery.
Outbound messages use a named outbox port and can return `deferred`; this
adapter performs no in-process retry.

## Current limits and deferred work

The public implementation supplies typed contracts and deterministic fixtures
only. It does not create a Slack app, request `connections:write`, obtain a
Socket URL, connect a WebSocket, subscribe to events, resolve an identity from
a real workspace, configure a channel, or deliver an external message. Slack
app creation, scopes, secret references, workspace authorization records,
outbox binding, connection-refresh handling, and a disposable integration
canary are private, separately authorized work.
