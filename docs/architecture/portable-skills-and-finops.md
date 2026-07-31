# Portable skills, independent estimation, and FinOps lineage boundary

Phase 8 adds only generic contracts, pure placement enforcement, injected
adapter ports, and deterministic fixtures. It does not install a primitive,
contact an estimator, import a rate card, calculate a bill, access a host, or
create an accounting connection.

```text
generic bundle transport -> strict portable manifest -> Coordinator-compatible skill evidence
independent estimator transport -> range + model + calibration basis -> durable estimate record
observed separate effort + versioned rate card -> allocation records -> linked planning feedback
```

## Portable primitive boundary

`PrimitiveBundleManifest` has a generic `bundle://` reference, one bundle
version, and a list of `PortablePrimitive` declarations. Each primitive carries
only purpose, declared capabilities, security domains, a narrow read/write
contract, a redacted output contract, and per-harness enforcement truth.

The public schema rejects inline secrets and free-text attempts to embed host
availability, session identifiers, credentials, or secret references. A worker
manifest reports both installed skill versions and bundle membership. A job
requires only an `enforced` skill; the pure Coordinator placement filter
excludes a candidate missing that skill or unable to satisfy its declared
version range before it creates a durable job or contacts a worker.

`PortablePrimitiveCatalogAdapter` composes a separately operated bundle
transport. It validates the returned bundle and its source reference but has no
filesystem, process, identity, installation, enrollment, or host-inventory
API. A missing primitive is an explicit dispatch/attention condition, not a
request for automatic installation. `redactOperationalDetail` preserves a
bounded operational summary only after secret-safe validation; authentication
and credential handoff remain out of band.

## Estimation and accounting boundary

`IndependentEstimatorAdapter` calls an injected independently versioned
transport and validates its returned `EstimateRecord`. The record retains low,
expected, and high agent-round and wall-clock ranges, estimator model/version,
calibration version, evidence references, and optional supersession lineage.
The adapter does not reproduce estimator logic or derive currency from an
estimate.

`FinOpsLedgerStore` is a durable port for source-only facts. It records an
estimate; separate agent-execution, human-attention, blocked, and verification
measurements; versioned rate cards; task/run-scoped allocations; and linked
relative planning feedback. An allocation keeps its rate-card ID/version,
method, category, quantity, amount, currency, and the literal declaration
that the accounting system of record is external. Direct, fully-loaded,
human-inclusive, and failure-adjusted categories remain distinct.

`assertFinOpsLineage` proves task/run/security-domain correlation, rate-card
compatibility, and explicit planning references without producing invoices or
transactions. `PlanningFeedback` intentionally has relative points and links
only; its strict schema cannot silently carry a currency amount.

## Deterministic proof and deferred composition

`pnpm run check:skills-estimation-finops` uses in-memory ledger and transport
doubles. It proves missing-skill refusal, bundle compatibility, redacted relay
content, estimation evidence/ranges, all four effort measures, all four cost
categories, external accounting truth, and planning feedback without a live
registry, estimator, rate-card source, accounting product, network call, or
host action.

A future private composition may bind approved registries, estimators,
rate-card imports, accounting reconciliation, and durable database storage
only after separately authorized source identities, security-domain policy,
redacted evidence, failure handling, and rollback are reviewed. It must not
make a primitive registry, model, ledger, or portfolio system an authority for
Coordinator task/run state.
