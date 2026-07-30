# ADR-0009: Independent safety monitor and dry-run remediation

Status: accepted

Worker safety observations are collected through an injected, independently
invocable monitor rather than an agent turn or provider process. The monitor
emits a versioned, secret-safe policy audit record and can place a supervisor
into drain or quarantine before later admission. A transition is fail-closed:
an interrupted audit write never re-opens admission.

The public runtime never executes cleanup, removes files, kills a process,
starts a timer, or manages a service. Cleanup is an explicit-target dry-run
proposal; any broad or recursive delete needs a recorded policy approval and
approved explicit replacement targets before a later, separately authorized
execution adapter could act.
