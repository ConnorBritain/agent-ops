# ADR-0001: Operational state is durable and internal

Status: accepted

AgentOps keeps task, run, event, health, attention, policy, and cost state in its durable operational core. Chat, portfolio tracking, provider consoles, and remote-access portals are projections or observations, not sources of truth.

This supports replayable integrations, outage recovery, and evidence without relying on transcripts.
