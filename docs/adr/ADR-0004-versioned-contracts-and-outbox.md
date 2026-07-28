# ADR-0004: Versioned contracts and transactional outbox

Status: accepted

Commands, job envelopes, and events are versioned. State transitions and outbound projection records write atomically; integrations retry from the outbox and expose dead-letter state.
