# ADR-0005: No automatic workload restart after host boot

Status: accepted

Workers restore their supervisor and health reporting after boot but remain idle. The Coordinator reconciles prior runs and decides whether work is resumable, stale, cancelled, or requires attention.
