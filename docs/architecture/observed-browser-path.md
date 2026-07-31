# Human-confirmed observed browser boundary

Phase 9 defines a typed handoff for a person to observe an already-open browser
and return an already-redacted summary. It is not a browser automation client,
a desktop-control client, a remote-access integration, or a scheduler
transport.

```text
sealed job + declared domains + write authority
  -> pure policy classification
  -> human observer supplies redacted evidence
  -> no-execution provider records attention/artifact metadata
  -> human confirmation is an audit record, never an action trigger
```

## Provider declaration

`ObservedBrowserProvider` declares `human-observed` maturity and
`no-execution`. Its only declared controls are `observe` and
`request-human-confirmation`; it declares neither autonomous browser input nor
autonomous desktop control. The provider's only injected port is
`HumanBrowserEvidencePort`, which receives a correlated, redacted summary from
a human observer. No implementation in this public package opens a browser,
connects to a device, launches a process, calls a network API, or reads a
credential.

## Policy and confirmation

Every `BrowserObservationRequest` names an exact canonical DNS hostname in its
own allowed-domain list, carries a security domain, specifies either
`observe-only` or `human-confirmed-write`, and requires human confirmation.
Schemes, paths, ports, wildcards, and IP literals are not valid domain values.
The policy refuses an undeclared target domain and refuses a proposed write
when the request is observation-only.

For an authorized write proposal, an approval is only a correlated human audit
record. It records no click, type, submission, desktop action, or external
state change. The provider remains in `attention` after recording approval;
there is deliberately no code path from approval to browser action or
Coordinator scheduling authority.

## Evidence and deferral

The durable evidence contract contains a bounded redacted summary, an opaque
evidence ID, the declared domain, classification, and verification that raw
content was not retained. It excludes raw page content, cookies, credentials,
screenshots, device identifiers, and browser-session material.

`pnpm run check:observed-browser-path` runs static and deterministic fixtures
only. A real interactive observation is a separately authorized private
canary: it needs an approved operator, disposable allowed domain, scoped human
identity, approved evidence destination, a no-submission procedure, and
private-only records. Remote-access products remain confined to their existing
human-operated security boundary and cannot become browser or scheduler
authority.
