# ADR-0019: Compose portable skills and independent FinOps lineage without operational authority

Status: accepted

## Context

AgentOps needs portable behavioral primitives, dispatch-time skill refusal,
repeatable estimates, and useful cost/planning feedback. A primitive bundle,
estimation model, rate card, or accounting product can be versioned,
unavailable, or wrong for a security domain. None may silently acquire host
facts, credentials, installation authority, Coordinator authority, or task/run
state ownership.

The public template must prove the contract without selecting a real primitive
registry, executing a primitive, calling a model, importing commercial rates,
or connecting an accounting system.

## Decision

Introduce strict portable primitive and bundle contracts. A primitive declares
purpose, capabilities, security domains, narrow access, redacted output, and
harness enforcement truth. The schema rejects secret and runtime-host facts;
worker manifests report bundle membership and installed primitive versions.
Only an explicitly enforced job requirement affects Coordinator placement, and
the pure placement filter rejects an absent or incompatible version before a
job is created or dispatched.

Compose a primitive catalog and estimator only through injected named
transports. The catalog validates a generic bundle reference and deterministic
enforcement coverage; it has no installation operation. The estimator validates
independently supplied low/expected/high ranges, model, calibration, evidence,
and task/run/domain correlation; it does not duplicate estimation logic.

Represent FinOps as correlated source facts behind a durable ledger port:
separate effort measures, versioned rate cards, allocation method/category,
task/run lineage, and a linked planning record. Declare external accounting as
the transaction and invoice system of record. Keep relative planning points in
a strict currency-free contract.

## Consequences

- Missing enforced skills fail closed before worker dispatch; any future
  installation remains a separately approved, redacted attention workflow.
- Agent execution, human attention, blocking, verification, direct,
  fully-loaded, human-inclusive, and failure-adjusted measures are not
  collapsed into one opaque cost number.
- Source-level deterministic fixtures prove shape, lineage, and refusal but do
  not claim a live primitive registry, model, rate source, accounting service,
  worker installation, or host action.
- A private integration may add reviewed adapters and durable persistence, but
  it must preserve external accounting truth and cannot make a planning point
  equal currency or grant a provider/estimator Coordinator authority.
