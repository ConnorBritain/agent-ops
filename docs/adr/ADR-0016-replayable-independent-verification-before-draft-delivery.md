# ADR-0016: Require replayable independent verification before draft delivery

Status: accepted

## Context

The first product vertical slice must demonstrate that a blocked operation can
receive a durable human answer, continue only its retained run, and produce a
reviewable draft outcome without broad automation. Provider observations are
useful execution evidence but are not an independent verification verdict.

## Decision

AgentOps models verification and draft delivery as separate typed ports.

- The Coordinator persists an attention answer before it considers a resumed
  dispatch and constrains the resume to the original task and run.
- `VerificationRecord` is a versioned, independent evidence record. A draft
  intent must reference it and a matching policy decision.
- The draft-delivery service reserves by delivery ID and idempotency key,
  records verifier and policy decisions, rejects any non-pass verdict or
  non-allow policy, and accepts only a `draft: true` intent and safe
  `draft-pr://` result.
- The source-level vertical fixture uses only deterministic fakes: a scripted
  local-stdio provider protocol, Slack ingress/projection ports, in-memory
  durable stores, an independent verifier, policy, and draft gateway. It
  proves ordering, replay, no answer echo, and negative gates without creating
  a provider process, repository, credential, connection, or pull request.

## Consequences

- The first attention-and-delivery acceptance evidence is reproducible in CI
  and cannot accidentally make a real external write.
- A real GitHub projection remains a later separately authorized composition
  concern. It must use the same durable reservation before a scoped external
  call and may create drafts only, never merge or release.
- The fixture does not claim a hosted Coordinator, live Slack app, actual
  disposable repository, provider installation, or production verification
  service. Those remain explicit private integration gates.
