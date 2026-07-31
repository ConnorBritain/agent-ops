# ADR-0015: Keep Slack Socket Mode non-authoritative and secret-reference-only

Status: accepted

## Context

Attention is the primary human-facing AgentOps surface, but chat history must
not become operational truth. A chat adapter must avoid acquiring worker,
provider, Scheduler, or Coordinator authority; it must also tolerate duplicate
delivery and avoid retaining legacy wire token and response URL fields.

Slack Socket Mode fits the intended future network boundary because it does not
require a public request URL. Slack's documented Socket Mode protocol uses a
runtime WebSocket URL, provides an `envelope_id`, and requires acknowledgement
of received events. The WebSocket connection is pre-authenticated, so this is
not an HTTP signing-secret integration. See [Using Socket Mode](https://docs.slack.dev/apis/events-api/using-socket-mode/).

## Decision

The public template implements a pure, injected-port Socket Mode adapter.

- The configuration permits only secret-store references for app and bot
  tokens; it rejects inline values, public HTTP ingress, signing-secret fields,
  and unknown configuration.
- Raw wire events are minimized before any durable port sees them. Verification
  tokens, response URLs, trigger IDs, channel information, and display data are
  not retained.
- An explicit workspace-and-actor resolver maps an authenticated Slack identity
  to an authorized AgentOps human principal and security domain.
- A durable ingress receipt is reserved before the Coordinator command port and
  completed before Socket acknowledgement. Duplicate receipts are acknowledged
  without a second command. A failed durable command is left pending and
  unacknowledged so a retry can reuse its idempotency key.
- Slack projects a concise attention summary separately from an exact worker
  question and only after a domain-scoped audience resolver permits each
  projection. Authentication is an out-of-band handoff; answers are confirmed
  without being echoed.
- The adapter owns no external connection, listener, retry loop, provider or
  worker action, or operational state mutation.

## Consequences

- A future private composition root must bind the adapter to a reviewed Slack
  app, scoped secret references, durable ingress/outbox implementation, and
  workspace authorization data.
- Connection refresh and disconnect handling, real Slack scopes, app manifest,
  audience/channel configuration, and real delivery require a separately
  authorized integration canary.
- The first end-to-end attention-and-draft-delivery scenario remains unfinished:
  this adapter establishes its ingress and projection contracts but does not
  resume a real worker or open a pull request.
