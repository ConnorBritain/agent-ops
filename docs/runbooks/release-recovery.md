# Release and recovery runbook

## Scope and stop conditions

This public runbook is a safe diagnostic and record-review procedure. Stop
before connecting to an environment, accessing a backup system, applying a
migration, modifying a service, enrolling/replacing a worker, or materializing
a secret unless an approved private release record identifies the operator,
scope, rollback/forward-repair owner, and evidence destination.

Do not treat a successful public fixture as a completed production change.

## Source-level diagnostic

1. Review the proposed compatibility manifest: all required components must
   declare current version, accepted range, and backwards-compatibility
   behavior.
2. Confirm the only recorded promotion path is development to canary, followed
   by canary to stable, and that each has a human approval and compatibility
   evidence reference.
3. Confirm every migration gate is append-only and expand-before-contract. For
   a destructive migration, stop if any of verified backup, human approval, or
   forward-repair runbook reference is absent.
4. Confirm the backup verification covers operational state, configuration,
   persistent memory, and documented secret references, and records a verified
   restoration result. Stop on any missing coverage or failed verification.
5. Confirm the replacement rehearsal retains precisely the immutable durable
   ledger records and records bootstrap, registration, validation,
   provisioning, health, and controlled drain. Stop if any record is lost.
6. Confirm redaction verification and each critical safety test passed before
   accepting the final release-gate record.

The only command provided by this public slice is the source-only validation
command `pnpm run check:release-recovery`; it has no deployment effect.

## Private execution handoff

An approved private release procedure must separately specify environment and
identity scope, protected backup/restore ownership, migration approval,
forward-repair and rollback paths, change window, health evidence, worker
enrollment/drain details, and secret-store references. Keep all of those facts
out of the public repository.
