# Worker service packaging runbook

## Scope and stop condition

This repository slice supplies static templates only. Stop before any service
installation, account creation, package download, configuration write, host
change, or device enrollment unless a private worker-canary authorization has
approved that exact host and rollback plan.

## Preflight for a future private installation

1. Verify the host baseline, physical recovery, private-network access, disk
   floor, and no-sleep policy in the private overlay.
2. Provision a dedicated service identity; never reuse an interactive owner
   account or an administrator identity.
3. Pin and verify the supervisor distribution and, for Windows, the approved
   wrapper binary. Do not use an unverified download or a current-user PATH.
4. Materialize only secret references in configuration. Keep values in the
   approved secret store and record a rollback owner.
5. Copy the platform template through the approved private deployment process,
   then run its verification-only script before a reboot test.

## Acceptance boundary

The later private worker canary must prove startup without user login,
registration/heartbeat, idle recovery with no workload resume, resource
refusal, cancellation, private-network recovery, and optional human-operated
RustDesk access. Static template validation is not permission to install or
start a service.

## Removal and rollback

The future private deployment record must include platform-specific disable and
removal commands, artifact/config preservation, secret-binding revocation, and
an owner confirmation. Do not remove worktrees, logs, or session evidence as
part of service rollback.
