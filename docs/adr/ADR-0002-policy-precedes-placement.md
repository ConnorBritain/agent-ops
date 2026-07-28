# ADR-0002: Policy precedes placement

Status: accepted

The Coordinator applies deterministic policy before scheduler placement. Security domain and mandatory capability checks filter candidates before affinity, load, estimated duration, cost, or human preference scoring.
