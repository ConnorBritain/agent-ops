# ADR-0012: PrintProvider is a no-execution reference provider

Status: accepted

## Context

Provider-neutral contracts need a deterministic proof that every lifecycle
operation is explicit, correlated, secret-safe, and normalizable before a
real CLI is selected. A real provider or shell-backed mock would introduce
credentials, host mutation, vendor semantics, and process cleanup risks into
the first shared conformance suite.

## Decision

`packages/provider-sdk` owns the typed lifecycle port, capability-only
routing, correlated observation normalization, and shared conformance harness.
`packages/providers/print` implements the full lifecycle with
`executionMode: no-execution`.

For each environment check, lifecycle operation, and artifact collection,
PrintProvider records one deterministic plan. The plan retains the stable job,
task, run, domain, declared capabilities, requested path, resource budget, and
a digest of the sealed envelope. It deliberately omits job body, callback
identity, signature references and values, and arbitrary invocation input.
It returns `execution: not-started`, has no child-process or shell API, and
cannot mutate Coordinator, task, or run state.

## Consequences

- Future providers must declare every lifecycle operation as supported or
  unsupported, route only by declared capability, emit correlated
  observations, and pass the shared suite.
- PrintProvider proves contracts and redaction, but does not prove launch,
  input, inspection, cancellation, artifact recovery, or crash behavior for a
  real CLI.
- The next slice may research only documented, supported CLI control surfaces;
  selecting one does not authorize credential setup or execution.
