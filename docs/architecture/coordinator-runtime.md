# Coordinator runtime boundary

`apps/coordinator` is a transport-neutral application service. It turns a
validated command plus a pre-signed job envelope into a durable job only after
recording intent, evaluating policy, and recording a placement decision. It is
not an HTTP server, timer, worker launcher, provider implementation, chat bot,
or cloud deployment.

```text
validated command + signed envelope
  -> CoordinatorDurableStore.recordIntent
  -> CoordinatorPolicyEngine.evaluate
  -> selectPlacement (domain, health, capability, preference score)
  -> CoordinatorDurableStore.recordSchedulingDecision
  -> CoordinatorDurableStore.createJob
  -> assigned-worker dispatch port
  -> provider acknowledgement observation

blocked, unavailable, or stale state
  -> CoordinatorDurableStore.createAttention
  -> human-facing projection port
```

## Authority and ordering

- The Coordinator persists the received intent before policy evaluation or any
  downstream call.
- Policy is evaluated before Scheduler placement. Security domain, health, and
  required capabilities filter candidates before provider preference and score.
- Every outcome, including a denial or no eligible candidate, records the
  candidate inputs, exclusions, policy rationale, and selected placement (if
  any).
- A job is persisted before the assigned-worker dispatch port is called.
- An assigned worker may acknowledge delivery or provider start, but this only
  records `ProviderAcknowledgement`. It cannot mark a run running.
- The reconciler compares durable desired state with independently observed
  worker/provider state. Unknown, failed, unavailable, or divergent state
  becomes durable attention with `automaticallyRestart: false`; it never
  restarts a workload.

## Attention boundary

`CoordinatorDurableStore.createAttention` is invoked before the
`CoordinatorAttentionDelivery` projection. A transport failure therefore
leaves a durable, actionable record and returns a deferred delivery result; the
application service does not retry in-process. `AnswerAttentionItem` persists
its secret-safe response before the response projection is attempted.

The future Slack adapter may implement this projection port, but Slack is not
an authority or system of record. Provider and worker sessions remain behind
their own bounded ports.

## Current implementation limits

The public runtime provides typed ports, deterministic in-memory fixtures, and
application ordering only. A later authorized private composition root will
bind the durable store to the reviewed hosted schema, provide a scoped runtime
identity, arrange reconciliation invocation, and attach transport adapters.
This repository adds no listener, process launcher, provider binary, host
connection, credential, timer, service registration, or external delivery.
