# Current status

## Phase 0 — governed public bootstrap

Status: **complete** on 2026-07-28.

This slice established the public specification catalog, governance tooling, acceptance catalog, Roadmap, ADRs, TypeScript/pnpm policy, public-data guard, and private-overlay boundary. It deliberately added no Coordinator, worker, provider, database, host, credential, relay, or deployment implementation.

Completion evidence:

- Public bootstrap pull request #1 merged to `main`.
- Public GitHub Actions governance validation passed.
- The generated specifications are current, sanitized, and public-data guarded.
- Roadmap validation and rendering succeed.
- The private implementation overlay was seeded independently from the merged public baseline and its private validation passed.

Private host baseline and RustDesk enrollment remain a separately gated
private-overlay workstream requiring owner authorization, a finalized
relay/security design, and private-only configuration.

## Phase 2 — durable operational core

Status: **local implementation complete** on 2026-07-29; hosted verification is gated.

The generalized implementation was completed independently of any private host
or cloud project. The local slice adds versioned TypeScript contracts, pure
placement/reconciliation rules, a transport-neutral Supabase adapter, explicit
Postgres schemas, RLS, an append-only event log, transactional outbox,
database-timed Coordinator leases, fencing-token enforcement, and local pgTAP
acceptance tests.

Completion evidence:

- Governance, generated views, TypeScript, and unit validation pass.
- A fresh ephemeral Supabase stack applies the migration and passes the pgTAP
  authorization, lineage, fencing, idempotency, outbox, and recovery suites.
- Database lint passes for all durable schemas.
- Review findings covering stale leaders, worker spoofing, abandoned outbox
  locks, idempotency collisions, secret guards, and reconciliation drift are
  incorporated in the validated implementation.

This work created no remote project, credential, Coordinator process, worker
process, provider session, or deployment. Applying the migration to a hosted
project remains the separately authorized `supabase-remote-verification`
private-overlay gate.

## Ordered v1 implementation

Status: **Phase 3 worker core, safety hooks, static service packaging, all
Phase 4 Roadmap/PrintProvider work, the normalized Codex App Server and Claude
Code adapters, the local Coordinator application service, the
non-authoritative Slack attention adapter, and the replayable
verified-draft-delivery fixture are complete** as of 2026-07-30.

The Roadmap now represents the complete normative rollout from the local
durable foundation through worker safety, Roadmap composition, PrintProvider,
two CLI providers, the first attention-and-verified-delivery vertical slice,
external projections, skills and FinOps, release recovery, observed browser
support, optional curated memory, and separately authorized federation.

The durable core is an executable foundation. The deterministic
`verified-draft-delivery` slice now proves the complete attention-and-delivery
loop before broader automation: one blocked attention, durable answer, same-run
continuation, independent verification, policy gate, replay-safe draft-only
delivery, and negative verifier/policy refusal. Hosted composition and real
external projection remain separately authorized.

Every one of the 130 normative requirements now has an enforced primary
requirement-to-slice-to-acceptance-to-test mapping in
`docs/traceability/v1-requirements.yaml`. Future evidence is labeled planned or
gated rather than being inferred from code existence.

## Phase 3 — worker runtime core

Status: **local worker core complete** on 2026-07-30; host service packaging
and enrollment are not started.

The transport-neutral `packages/worker` supervisor now starts idle, registers a
versioned capability/skill manifest, publishes sequenced heartbeats and
normalized lifecycle/health events, and exposes bounded admission,
inspection, and cancellation paths. Its pure preflight decision rejects
unverified policy or signatures, expired or mismatched leases, domain/path
mismatches, missing capabilities or skills, missing or excessive resource
budgets, disk/memory/worktree pressure, and job-capacity overcommit before any
provider can start.

Deterministic fixtures prove duplicate accepted envelopes create no duplicate
lifecycle event, reservations are accounted before another admission, inline
secrets are rejected, and supervisor startup restores no workload. The package
intentionally has no inbound listener, provider launcher, service-manager
definition, host identity, secret, or remote connection.

## Phase 3 — worker safety hooks

Status: **local safety implementation complete** on 2026-07-30; private
enrollment is not started.

`packages/policy` now evaluates bounded resource, stale-session, orphaned
process, cleanup, and unsafe-delete facts without host mutation. Its
independently invocable `WorkerSafetyMonitor` records a versioned, secret-safe
safety audit through the existing worker control-plane port. Critical resource
findings drain or quarantine the supervisor before another admission; a failed
audit write deliberately leaves that safe transition in place. Cleanup is only
a dry-run proposal, and broad or recursive deletion is intercepted until a
recorded approval supplies explicit replacement targets.

Deterministic policy and worker fixtures prove the resource decision matrix,
hung-agent monitoring without an admission/turn, stale-session and orphaned
process evidence, no-execution cleanup, unsafe-delete refusal, and
quarantine-before-later-admission. The slice creates no timer, host command,
process termination, filesystem deletion, service definition, credential,
provider launcher, or remote connection.

## Phase 3 — worker service packaging

Status: **local static service packaging complete** on 2026-07-30; no template
has been installed or activated.

The repository now contains versioned systemd, launchd, and Windows-wrapper
definitions that run only an outbound `supervisor-only` process at boot under a
dedicated account. They may recover a failed supervisor but cannot resume an
agent workload, start a provider, open an inbound listener, or depend on
RustDesk. Read-only verification scripts and deterministic reboot-idle fixtures
validate the static contract. The templates retain paths and secret references
only; they neither create accounts nor download, install, start, or configure
anything on a host.

`REQ-WORKER-001`, `REQ-WORKER-005`, real cryptographic verification, scoped
runtime identity, durable actionable attention routing, and private canary
evidence remain planned or gated rather than inferred from static packaging.

## Phase 4 — Roadmap readiness and no-execution provider conformance

Status: **local Roadmap adapter complete** on 2026-07-30; no physical worktree
has been created and no agent has been launched by the adapter.

`RoadmapReadAdapter` consumes Roadmap's typed read-only `plan` and `show`
operations through a named MCP transport. It validates the current ready wave
and gate, rejects non-ready, gated, blocked, mismatched, or secret-bearing
responses, and retains stable correlation, task, run, security-domain, slice,
branch, and worktree references. It returns only a `not-started` intent; it
does not parse the Roadmap graph, create a worktree, launch an agent, or write
back to Roadmap.

The Roadmap dependency/protocol are versioned separately. A future integration
must independently version primitive, estimator, and architecture references;
therefore `REQ-CONTEXT-005` and full `ACC-PLANNING-001` remain planned.

`packages/provider-sdk` now provides a complete typed lifecycle declaration,
capability-only routing, correlated observation normalization, and a shared
conformance harness. `PrintProvider` passes that harness and records one
redacted, sealed `execution: not-started` plan for every lifecycle operation.
It contains no process execution path and cannot update Coordinator, task, or
run state. `REQ-PROVIDER-001` through `REQ-PROVIDER-004` and `REQ-TEST-002`
are complete as local evidence.

## Phase 5 — First CLI-provider selection

Status: **deterministic adapter complete** on 2026-07-30; real provider
binding remains separately gated.

The selected first protocol is the Codex CLI App Server over local stdio. The
new `CodexAppServerProvider` accepts an injected JSON-RPC session factory and
orders `initialize`, thread/turn start, active-turn steer, inspection, and
interruption while keeping pause/resume explicitly unsupported. It emits only
correlated normalized observations and bounded session artifacts; it does not
mutate task or run state. Unknown or secret-bearing protocol output is refused,
transport failure produces redacted attention evidence, and a failed invocation
cannot restart automatically.

`ScriptedJsonRpcTransport` proves conformance, crash recovery, cancellation,
artifact redaction, local-stdio-only preflight, and no-execution behavior
without a provider binary, credential, process, or network connection. The
new `first-cli-provider-runtime-canary` slice is private and gated on owner
authorization, scoped provider identity, a disposable repository, and a
reviewed rollback plan.

## Phase 6 — Coordinator runtime

Status: **local application service complete** on 2026-07-30; hosted
composition and human-facing transport are not started.

`apps/coordinator` now persists a command intent before policy evaluation,
applies domain/capability/health filters before scoring, records all scheduling
inputs and exclusions, persists a job before assigned-worker dispatch, and
records any provider acknowledgement strictly as an observation. It has no
code path that promotes acknowledgement into a running state.

The reconciler compares desired and observed state through a durable port and
creates attention for stale, unavailable, failed, or divergent state with no
automatic restart. Attention items and durable answers are written before their
respective projection ports are called; a projection failure stays deferred and
is never retried in-process. Deterministic fixtures prove the full ordering,
negative placement, acknowledgement, stale-state, and redaction behavior.

No timer, listener, hosted database binding, scoped service identity, chat
workspace, provider process, worker connection, credential, or external
message was created. A future private composition root must independently bind
the reviewed durable schema and delivery transports.

## Phase 6 — Slack attention adapter

Status: **local Socket Mode contract implementation complete** on 2026-07-30;
real Slack composition is not started.

`SlackSocketModeAttentionAdapter` is a typed, deterministic ingress and
projection boundary. It accepts `secret://` token references only, rejects
HTTP ingress and signing-secret configuration, strips raw wire token and
response URL fields, maps a workspace actor to an authorized internal human
principal, and reserves a durable deduplication receipt before calling the
Coordinator command port. It completes the receipt only after durable command
confirmation and then acknowledges the Socket envelope; a failed durable call
leaves the receipt pending and unacknowledged for safe retry.

Attention summaries and exact worker questions are separately audience-scoped
messages. Authentication is an out-of-band handoff, and chat confirms a
durably recorded answer without echoing its body or claiming worker resume.
Deterministic fixtures prove authorization refusal, duplicate delivery,
ingress/Coordinator/acknowledgement ordering, raw-field minimization, summary
separation, response redaction, and no external SDK or connection behavior.

No Slack app, app-level token, bot token, Socket URL, WebSocket, workspace
record, channel, outbox runner, external message, real worker response, or
provider process was created. The deterministic test double composes the
reviewed contracts but is not a live Slack or worker deployment.

## Phase 6 — replayable verified draft delivery

Status: **deterministic vertical fixture complete** on 2026-07-30; external
integration is not started.

The fixture creates exactly one policy-blocked attention item, projects it
through the Slack Socket Mode boundary, reserves a durable ingress receipt,
records the authorized human answer before calling a new Coordinator dispatch
for the retained task and run, and records only a provider acknowledgement as
an observation. A scripted Codex App Server protocol produces secret-safe
implementation evidence without a binary or process. A distinct independent
`VerificationRecord` and matching policy decision must be persisted before the
draft-only gateway can return a safe `draft-pr://` reference. Failed verifier
or policy gates never call the gateway; a completed delivery replay creates no
second draft.

The fixture uses only in-memory stores and injected ports. It does not create
a Slack app, WebSocket, provider session, hosted Coordinator, GitHub
repository, external pull request, credential, host change, or cloud resource.
A live Slack/provider/GitHub disposable-repository canary remains a private,
separately authorized composition task.

## Phase 7 — second normalized CLI provider

Status: **deterministic adapter complete** on 2026-07-30; real provider
binding remains separately gated.

`ClaudeCodeProvider` joins `CodexAppServerProvider` and `PrintProvider` under
the exact shared lifecycle/conformance path. It is an injected local-stdio
print-mode JSONL adapter with policy-supplied model, turn, and budget limits;
the selected profile requires bare mode, disabled session persistence, and
`dontAsk` permission refusal. It explicitly declares same-session input,
pause, and resume unsupported. It reduces only safe init/stream event classes
to correlated observations, retains no response, transcript, auth, cost, or
usage content, requests cancellation through its injected port, and forbids
automatic restart.

`pnpm run check:provider-conformance` now passes the common suite for
PrintProvider plus deterministic Codex App Server and Claude Code fixtures.
The proof contains no installed Claude binary, account, model entitlement,
credential, local process, provider request, or host change. A real binding,
budget, authentication, and disposable canary remain separately authorized in
the private overlay.
