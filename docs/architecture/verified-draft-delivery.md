# Verified draft-delivery boundary

The Phase 6 vertical fixture connects the existing Coordinator attention path,
Slack Socket Mode contract, injected Codex App Server protocol fixture,
independent verifier, policy gate, and draft-only delivery port. It is a
deterministic, replayable test-double composition; it does not contact Slack,
GitHub, a provider binary, a host, or a database.

```text
blocked Coordinator dispatch
  -> durable attention item
  -> Slack attention projection
  -> durable Socket ingress receipt
  -> authorized human answer
  -> durable attention response
  -> dispatch of the same task and run only
  -> injected provider observation
  -> independent VerificationRecord
  -> delivery policy decision
  -> idempotent draft-only pull-request gateway
```

## Contracts and invariants

- `VerificationRecord` is distinct from `ProviderObservation`; it retains a
  verifier identity, verdict, safe evidence references, and verification time.
  Provider output cannot substitute for a verdict.
- `DraftPullRequestIntent` is strict and versioned. It has a durable delivery
  ID and idempotency key, references one task/run/domain, and has `draft: true`
  as its only delivery mode. It cannot represent merge, release, deployment,
  review dismissal, or a non-draft write.
- `VerifiedDraftDeliveryService` reserves delivery before work, records the
  verification result before evaluating delivery policy, records the policy
  gate before calling the gateway, and completes only after a safe
  `draft-pr://` reference returns. A completed reservation replays its prior
  result without another verification, policy evaluation, or draft creation.
- A failed verifier or non-allow policy produces a durable blocked result and
  never calls the draft gateway. A gateway failure leaves the reservation
  pending for a future authorized, idempotent outbox retry; this service has no
  retry loop.
- `CoordinatorRuntime.answerAndResume` writes the human answer before
  dispatching. It refuses an answer whose retained task/run does not equal the
  resumed envelope. This is explicit operator-driven continuation, not an
  automatic workload restart.

## Scope boundary

The fixture's `repo://fixture/reversible-change` and `draft-pr://fixture/...`
references are opaque deterministic test data, not a repository or pull
request. A separately authorized later projection slice may bind the gateway
to GitHub through a durable outbox, scoped identity, real disposable
repository, and reviewed rollback plan. That integration must retain the
same idempotency, verification, policy, draft-only, and no-automatic-restart
properties.
