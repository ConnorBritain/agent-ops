# GitHub and portfolio projection boundary

Phase 7 adds a deterministic external-projection application service. It
models the durable ordering and safe payloads needed for future GitHub and
portfolio integration without including an SDK, network client, credential,
repository, portfolio account, timer, or autonomous delivery process.

```text
Coordinator-issued projection command
  -> durable idempotency reservation
  -> explicit outbox claim
  -> named GitHub or portfolio projection gateway
  -> provenance-bearing external fact
  -> durable delivered record

temporary external failure
  -> redacted retryable outbox state
  -> later explicit replay by an authorized runner
```

## Authority and payload limits

- `CoordinatorProjectionCommand` requires an actor whose kind is
  `coordinator` and whose task, run, and security domain match its projection.
  An external adapter receives no task/run write port.
- The public intent union has exactly three forms:
  `github-draft-pull-request`, `github-ci-evidence`, and
  `portfolio-transition`. It cannot express a merge, review dismissal,
  release, deployment, arbitrary issue mutation, generic remote write, or
  provider control.
- A draft intent remains `draft: true` and references an independent
  verification ID. This projection contract complements, but does not bypass,
  the existing verified-draft-delivery policy gate.
- Portfolio transitions are projected only when human-scale: created,
  ready-for-review, blocked, completed, or failed. `running` and
  `provider-observed` are valid internal observations but are deliberately
  suppressed before outbox reservation or gateway delivery.
- Links are explicit, duplicate-free mappings for issues, Roadmap slices, pull
  requests, and external sessions. References are bounded opaque identifiers,
  not URLs, endpoint names, credentials, or raw provider payloads.

## Durability and provenance

`ExternalProjectionOutboxStore` reserves the Coordinator command before a
gateway call. It records only `pending`, `processing`, `delivered`, or
`dead-letter` state, a bounded attempt count, a redacted retry code, and a
validated fact after delivery. Duplicate submission observes that record and
does not call a gateway again.

Every returned `ExternalProjectionFact` carries its external system,
source kind and ID, source event ID, occurrence time, and ingestion time.
Secret-bearing or mismatched gateway results are discarded and reduced to the
safe `protocol-invalid` retry code. A temporary gateway failure becomes
`external-unavailable`; neither error makes a portfolio tracker or GitHub the
source of task, run, policy, verification, or operational state.

`replay(projectionId)` is an explicit single-record operation. The public
service supplies no timer, backoff loop, scheduler, or remote retry daemon.
A future composition root must bind the existing transactional database outbox
and its lock/attempt policy, preserve the same idempotency key, use a scoped
identity, and be separately owner-authorized before any real external call.

## Deterministic proof

`pnpm run check:github-portfolio-projections` proves multi-link lineage,
source provenance, Coordinator-only authorization, human-scale suppression,
outage isolation, retryable replay, duplicate suppression, destination
separation, and secret/malformed-fact refusal using in-memory outbox and
gateway doubles. It contacts neither GitHub nor a portfolio system.
