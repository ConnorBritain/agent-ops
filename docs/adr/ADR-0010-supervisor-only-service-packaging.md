# ADR-0010: Supervisor-only service packaging

Status: accepted

AgentOps ships reviewed, versioned service definitions for systemd, launchd,
and a Windows service wrapper descriptor, but no installer or active service.
The definitions start only the outbound worker supervisor at boot and do not
depend on an interactive login, RustDesk, an inbound listener, or a provider.

The service manager may restart a failed supervisor. It must never resume an
agent workload after a host restart; recovery authority remains with the
Coordinator. The template contains only paths and secret references. A private
worker-canary authorization must provision the dedicated account, signed
artifact, secret materialization, host-specific installation, verification,
reboot proof, and rollback record.
