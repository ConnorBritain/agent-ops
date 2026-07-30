# Known gaps

- Phase 0, the local durable core, and the transport-neutral worker supervisor
  are complete; no deployable Coordinator, worker service unit, provider
  launcher, or remote-access implementation exists yet.
- RustDesk is represented only as a constrained architecture contract; there is no relay deployment, endpoint, enrollment, or credential material.
- Durable-core and worker fixtures cover the local authority and admission
  boundaries. Independent safety hooks, provider launch, actual signature
  verification, service packaging, attention workflow, and full end-to-end
  fixtures remain future work.
- The full v1 Roadmap and traceability report now describe those future slices,
  but planned mappings are not completion evidence. `worker-safety-hooks` is
  the next autonomous local implementation slice.
- The public repository intentionally omits private source specifications, fleet inventory, network topology, and secret references beyond generic examples.
