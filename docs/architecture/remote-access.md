# Managed remote-access boundary

RustDesk is the initial named implementation profile for a human-operated GUI portal. It is a managed support capability, not an agent provider, scheduler transport, policy authority, or source of operational truth.

```ts
interface RemoteAccessPortal {
  inspectAvailability(input: RemoteAccessTarget): Promise<RemoteAccessStatus>;
  createHumanHandoff(input: HumanHandoffRequest): Promise<RemoteAccessHandoff>;
  recordSessionObservation(input: RemoteAccessObservation): Promise<void>;
}
```

The public profile may declare a relay secret reference, enrollment state, security domain, allowed operators, and health state. It must never contain a relay URL, device identifier, password, API token, unattended-access policy, or real host identity.

`createHumanHandoff` creates an auditable instruction or deep-link reference for an approved human. It cannot launch a provider, start a worker, grant a policy exception, submit browser input, or update task state. Coordinator-to-worker communication remains outbound and independent of remote desktop access.

Phase 0 does not deploy a RustDesk relay, enroll a device, create an account, distribute keys, enable unattended access, or change any host. Those actions require an approved future slice, an owner-authorized private overlay, a security review, and deployment evidence.
