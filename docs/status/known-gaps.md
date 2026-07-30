# Known gaps

- Phase 0 and the local durable-core slice are complete; no deployable
  Coordinator, worker service unit, provider launcher, or remote-access
  implementation exists yet.
- RustDesk is represented only as a constrained architecture contract; there is no relay deployment, endpoint, enrollment, or credential material.
- Durable-core unit and database fixtures cover the local authority boundary;
  worker runtime, provider launcher, attention workflow, and full end-to-end
  fixtures remain future work.
- The full v1 Roadmap and traceability report now describe those future slices,
  but planned mappings are not completion evidence. `worker-runtime-core` is
  the next autonomous local implementation slice.
- The public repository intentionally omits private source specifications, fleet inventory, network topology, and secret references beyond generic examples.
