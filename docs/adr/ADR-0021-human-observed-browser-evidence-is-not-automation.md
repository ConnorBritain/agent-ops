# ADR-0021: Treat browser observation and confirmation as human evidence, not automation

Status: accepted

## Context

AgentOps needs a way to represent carefully scoped browser observation without
turning a browser, remote-access tool, or visual desktop session into an
autonomous worker or a scheduler transport. Browser content and sessions may
also carry sensitive data that is unsuitable for durable public records.

## Decision

Introduce a `human-observed`, `no-execution` provider declaration with only
observation and human-confirmation controls. Every request must have exact
allowed domains, a security domain, explicit write authority, and a required
human confirmation. The only injected adapter port accepts an already-redacted
human observation; it cannot launch, control, or automate a browser or
desktop.

An approval for a write proposal is a correlated human audit record only. It
never causes a click, type, submission, remote-access action, provider launch,
or scheduling decision. Raw browser content and session material are excluded
from the contract.

## Consequences

- Domain and write-authority refusal is deterministically testable without a
  browser, host, credential, or external website.
- Public evidence stays bounded to redacted summaries and opaque identifiers.
- A real browser observation remains a separately authorized private canary
  with a disposable domain and human-operated procedure.
- Remote access remains a human-operated security boundary and cannot acquire
  provider or scheduler authority through this integration.
