# Release-recovery record template

This directory contains only a versioned static record-order declaration. It
does not download, install, start, stop, migrate, back up, restore, enroll, or
control any system.

A later private release operator must create and retain a validated
compatibility manifest; human-approved development-to-canary and
canary-to-stable promotion records; append-only migration gates; a
restoration-tested backup verification; a controlled worker-replacement
rehearsal; and a final release-gate record. The public template stores no host,
network, backup destination, project, account, credential, or secret value.

Use the source-only `pnpm run check:release-recovery` command to validate the
deterministic fixture. It is not a command to perform a release or recovery.
