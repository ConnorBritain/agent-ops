# Worker supervisor service package

These are reviewed service-definition templates and verification-only scripts.
They are not an installer, do not create accounts, do not download a wrapper,
do not start a service, and do not change a host. A private, separately
authorized enrollment must provide a signed supervisor artifact, an approved
dedicated service account, config containing secret references rather than
values, and a host-specific rollback record before any template is installed.

Every definition starts only the small outbound supervisor in `supervisor-only`
mode. It may be restarted after its own failure, but it never resumes an agent
workload, starts a provider, opens an inbound listener, or depends on RustDesk.
The Coordinator retains recovery authority after a reboot.

Linux uses a systemd unit and macOS uses a LaunchDaemon. Windows uses a
Windows Service Wrapper descriptor because a normal executable needs a service
host to participate in the Service Control Manager. The Windows wrapper binary
is deliberately not committed or downloaded by this repository; a private
installer must pin and verify it before use.

After an authorized private installation, run the platform verification script
as an authorized operator. Each script only reads service state and definition
content. The clean-host/reboot acceptance remains the private worker-canary
gate; a static definition is not deployment evidence.

Reference material: [systemd service documentation](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html), [Apple launchd job guidance](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html), and [WinSW XML configuration](https://github.com/winsw/winsw/blob/v3/docs/xml-config-file.md).
