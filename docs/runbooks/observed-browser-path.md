# Human-confirmed browser observation runbook

## Scope and stop conditions

This public runbook reviews a source-level handoff only. Stop before opening a
browser, connecting to a device, using remote access, authenticating to a
website, materializing a secret, typing into a page, clicking, submitting, or
changing external state. A passing deterministic fixture is not permission or
evidence to perform any of those actions.

## Source-level diagnostic

1. Confirm the provider declares `human-observed` maturity, `no-execution`, no
   automation, and no autonomous desktop control.
2. Confirm the target is an exact canonical hostname and is present in the
   request's explicit allowed-domain list. Stop on a wildcard, URL, path,
   port, IP literal, or undeclared domain.
3. Confirm the write authority is `observe-only` for a read-only request. A
   write proposal must use `human-confirmed-write` and must remain an
   attention item even after a person approves it.
4. Confirm the evidence is sourced by a human observer, is correlated to the
   request, contains no raw page content or screenshot, and has redaction
   verification. Stop if correlation or redaction fails.
5. Confirm there is no route from a confirmation record to a browser action,
   remote desktop action, provider launch, or scheduler decision.

The only command in this public slice is the source-only validation command
`pnpm run check:observed-browser-path`; it has no browser, host, network, or
deployment effect.

## Private interactive handoff

Before a separately authorized private canary, record the operator, a
disposable exact domain, scope and security domain, human confirmation format,
redacted evidence destination, no-submission procedure, abort conditions, and
incident owner. Keep endpoint details, access records, enrollment facts, and
all credentials out of the public repository.
