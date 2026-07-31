# Release compatibility, promotion, and recovery boundary

Phase 8 supplies typed evidence records and a pure acceptance gate. It is not
a release controller, backup client, migration runner, service installer, or
worker enrollment system.

```text
component observations -> compatibility manifest -> human-approved promotion records
append-only migration gate + restoration-tested backup -> release gate
durable ledger snapshot -> controlled replacement rehearsal -> release gate
```

## Compatibility and promotion

`CompatibilityManifest` declares a current version, accepted version range,
and backwards-compatibility behavior for the Coordinator API, worker runtime,
provider SDK and adapter, policy, database schema, job and event contracts,
and skill bundle. All component identities are stable internal categories; a
manifest includes no host, vendor account, endpoint, package source, or
credential.

`PromotionRecord` permits exactly `development -> canary` and `canary ->
stable`. Each record retains its compatibility manifest and opaque evidence
references and requires a human approval record. There is no automatic
promotion path.

## Migration, backup, and replacement

`MigrationGate` is append-only and uses `expand-before-contract`. A destructive
operation cannot be represented without a verified backup reference, human
approval, and a forward-repair runbook reference. `BackupVerificationRecord`
requires verified integrity and restoration for durable operational state,
versioned configuration, persistent memory, and documented secret references;
it contains no backup location or value.

`WorkerReplacementRecord` records generic internal worker IDs, a durable
ledger reference, immutable record IDs before replacement, the restored record
IDs, and each controlled-enrollment stage. The pure gate rejects a replacement
unless the immutable record sets match exactly. It never attempts to register,
drain, provision, or contact a worker.

## Release gate and deferral

`ReleaseGateRecord` links one compatibility manifest, both promotion records,
every migration gate, a full backup verification, a replacement rehearsal,
redaction evidence, and passed critical safety tests. The pure
`assertReleaseRecoveryLineage` gate blocks incompatible schemas, incomplete
backup verification, destructive migration without complete evidence, durable
ledger loss, failed redaction, and unaddressed critical safety tests.

`pnpm run check:release-recovery` runs deterministic in-memory tests only. A
real private release still requires an authorized operator, scoped identities,
approved environment topology, backup and restoration ownership, explicit
rollback/forward-repair decisions, and private-only evidence.
