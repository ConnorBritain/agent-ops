# ADR-0003: Provider-neutral contracts

Status: accepted

Providers implement a versioned lifecycle port and emit normalized observations. They cannot directly mutate task state. PrintProvider is the deterministic no-execution reference for contract tests.
