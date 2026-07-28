const requirement = (id, text, evidence) => ({ id, text, evidence });

export const documents = [
  {
    id: "CAT-001",
    file: "CAT-001-specification-catalog.md",
    title: "AgentOps Specification Catalog and Reading Guide",
    dependencies: [],
    crossReferences: ["SPEC-000 through SPEC-019", "BUILD-001"],
    purpose: "Provide the authoritative entry point, reading order, document convention, and traceability method for the public AgentOps specification set.",
    sections: [
      ["How to use this set", "Read the charter and v1 scope first. Establish authority, security, data, contracts, and runtime boundaries before writing implementation code. Integration, intelligence, operations, testing, and rollout specifications follow. BUILD-001 guides an implementation session but never overrides a normative specification."],
      ["Governance triangulation", "Normative specifications, executable acceptance scenarios, Roadmap slices, and ADRs remain synchronized. A slice is incomplete until requirement mappings, evidence, Roadmap state, and relevant ADRs agree. Current status, blockers, and known gaps are part of the handoff record."],
      ["Implementation handoff", "When truth is unclear, consult the owning specification, its acceptance scenario, the Roadmap slice, the ADR record, and current status documents—in that order. Do not infer durable state from a chat or provider transcript."]
    ],
    requirements: [
      requirement("REQ-CATALOG-001", "Every normative specification declares an ID, version, status, dependencies, cross-references, requirements, acceptance evidence, and open decisions.", "Metadata lint."),
      requirement("REQ-CATALOG-002", "Every completed slice maps to requirements, tests, Roadmap state, and relevant ADR evidence.", "Traceability report."),
      requirement("REQ-CATALOG-003", "BUILD-001 is a governed implementation prompt and does not override normative specifications.", "Prompt governance review.")
    ],
    acceptance: "A new implementation agent can locate requirement ownership, select the correct reading order, and identify the evidence required to complete a slice.",
    open: "Automate documentation linting and traceability reporting in the repository bootstrap."
  },
  {
    id: "SPEC-000",
    file: "SPEC-000-program-charter.md",
    title: "AgentOps Program Charter",
    dependencies: ["CAT-001"],
    crossReferences: ["SPEC-001", "SPEC-002", "SPEC-003", "SPEC-019"],
    purpose: "Define a portable, provider-neutral system that lets a human supervise bounded coding-agent work without treating chat or terminal history as the operating record.",
    sections: [
      ["Operating model", "The human is final authority. The Coordinator converts intent into bounded work, applies deterministic policy, chooses eligible placement, observes execution, and surfaces meaningful attention. Workers execute jobs but do not redefine priority, trust boundaries, or privileges."],
      ["Systems of record", "A portfolio tracker owns organizational commitments; Roadmap owns repository-local decomposition and worktree readiness; Supabase Postgres owns execution state, health, attention, policy decisions, events, and FinOps attribution; GitHub owns source, pull requests, CI evidence, and accepted artifacts."],
      ["Program invariants", "Models propose while policy authorizes. Security domains are hard constraints. External integrations are projections. Workers protect hosts before accepting work. Version-controlled code, configuration, migrations, and documented secret references make the platform reproducible."],
      ["v1 outcome", "A bounded request resolves a ready slice, receives an estimate, runs on an eligible worker through a supported CLI provider, relays a blocker, resumes after a durable response, passes independent verification, opens a draft pull request, and retains evidence, attention, time, and cost lineage."]
    ],
    requirements: [
      requirement("REQ-CHARTER-001", "Attention management is the primary user-facing product.", "Attention-item scenario."),
      requirement("REQ-CHARTER-002", "Only the Coordinator converts human intent into an authorized job envelope.", "Command-to-job audit trace."),
      requirement("REQ-CHARTER-003", "Workers execute bounded jobs and cannot self-authorize policy exceptions.", "Denied self-escalation fixture."),
      requirement("REQ-CHARTER-004", "Accepted tasks retain readable request, execution, verification, attention, and outcome evidence.", "Accepted-task evidence export."),
      requirement("REQ-CHARTER-005", "Restricted-domain inventory remains unavailable for autonomous dispatch until federation approval exists.", "Scheduler rejection test."),
      requirement("REQ-CHARTER-006", "The platform is reinstallable from version-controlled artifacts and runbooks.", "Clean-host bootstrap rehearsal.")
    ],
    acceptance: "The program has named authorities, enforceable scope boundaries, and a testable v1 vertical-slice definition.",
    open: "Select a federation design before enabling any restricted-domain worker."
  },
  {
    id: "SPEC-001",
    file: "SPEC-001-v1-scope-and-acceptance.md",
    title: "V1 Scope and Acceptance",
    dependencies: ["SPEC-000"],
    crossReferences: ["SPEC-006", "SPEC-007", "SPEC-017", "SPEC-018"],
    purpose: "Set a narrow v1 that proves the governed operating loop before desktop automation, federation, or high availability.",
    sections: [
      ["In scope", "V1 includes approved personal workers, a durable operational core, Slack command and attention handling, Roadmap readiness and worktree preparation, two normalized CLI providers, draft pull-request delivery, meaningful portfolio projection, estimation capture, and allocation-ready FinOps."],
      ["Reference vertical slice", "A request creates a task and run, resolves a Roadmap slice, passes policy, selects an eligible worker, launches a provider, records normalized events, surfaces one attention item, receives a durable answer, verifies the result, opens a draft pull request, and projects completion and cost."],
      ["Explicit exclusions", "V1 excludes automatic merging, production deployment, cross-domain code exchange, opaque scheduling, autonomous browser control, and a production-ready restricted-domain worker. Observed desktop/browser paths require human confirmation until supported automation exists."],
      ["Definition of done", "Completion requires behavior, executable acceptance, Roadmap representation, and relevant ADR reconciliation. The demonstration uses a reversible change and proves both restart-safe recovery and a resource-gate refusal."]
    ],
    requirements: [
      requirement("REQ-V1-001", "V1 supports approved personal workers with health registration and heartbeats.", "Worker health scenario."),
      requirement("REQ-V1-002", "V1 persists task, run, session, event, attention, approval, estimate, and allocation records.", "Schema and traceability test."),
      requirement("REQ-V1-003", "V1 supports at least two normalized CLI providers.", "Provider conformance fixture."),
      requirement("REQ-V1-004", "V1 relays one blocked question and resumes the same run after a durable answer.", "Intervention scenario."),
      requirement("REQ-V1-005", "V1 opens a draft pull request only after a configured verification verdict.", "Delivery scenario."),
      requirement("REQ-V1-006", "V1 refuses launch when a resource threshold is violated.", "Resource-gate test."),
      requirement("REQ-V1-007", "V1 never dispatches a personal workload to a restricted-domain worker.", "Cross-domain negative test.")
    ],
    acceptance: "All entries in the v1 acceptance catalog are green, the end-to-end scenario is replayable, and known gaps are explicit.",
    open: "Choose the first CLI launch substrate after a bounded integration spike."
  },
  {
    id: "SPEC-002",
    file: "SPEC-002-system-context-and-authority.md",
    title: "System Context and Authority Boundaries",
    dependencies: ["SPEC-000"],
    crossReferences: ["SPEC-004", "SPEC-005", "SPEC-006", "SPEC-011"],
    purpose: "Define component ownership and failure isolation so an external integration cannot become accidental source of truth.",
    sections: [
      ["Context", "The Coordinator sits between the human control surface and workers. It uses Roadmap for repository-local graph decisions, portable primitive bundles for behavior, and an independent estimator for calibration. Each external system is behind a named adapter and typed capability contract."],
      ["Authority map", "The Coordinator creates tasks, runs, and attention items but never bypasses policy. A Scheduler selects only eligible placements. Providers start and inspect sessions but do not directly update portfolio commitments. Sync projects verified state through an outbox."],
      ["Failure isolation", "An outage in chat, portfolio tracking, memory, or a provider queues or blocks projections without corrupting internal task, run, policy, or evidence state."]
    ],
    requirements: [
      requirement("REQ-CONTEXT-001", "External dependencies are accessed through named adapters with typed contracts.", "Adapter boundary review."),
      requirement("REQ-CONTEXT-002", "Internal operational state stays authoritative when an external sync fails.", "Outage tests."),
      requirement("REQ-CONTEXT-003", "An adapter cannot write a domain it does not own without a Coordinator-issued command.", "Authorization integration test."),
      requirement("REQ-CONTEXT-004", "Imported facts record source, source event ID, occurrence time, and ingestion time.", "Provenance assertion."),
      requirement("REQ-CONTEXT-005", "Roadmap, primitives, estimation, and architecture references remain independently versioned.", "Dependency manifest review."),
      requirement("REQ-CONTEXT-006", "External projections are replayable from an outbox.", "Outbox replay scenario.")
    ],
    acceptance: "Simulated non-authoritative dependency outages preserve coherent task and run state and create a recoverable projection backlog.",
    open: "Define the minimum status data allowed across any future federation boundary."
  },
  {
    id: "SPEC-003",
    file: "SPEC-003-trust-security-and-federation.md",
    title: "Trust, Security and Federation Model",
    dependencies: ["SPEC-000"],
    crossReferences: ["SPEC-004", "SPEC-007", "SPEC-010", "SPEC-019"],
    purpose: "Establish hard trust boundaries before dispatching agents across workers and remote-access sessions.",
    sections: [
      ["Security domains", "Tasks, repositories, credential references, artifacts, transcripts, memory namespaces, and browser sessions carry a security-domain label. A mismatch is a scheduling rejection, never a cost or performance tradeoff."],
      ["Identity and secrets", "Human, Coordinator, worker, and external-integration identities are distinct. Workers authenticate outbound with scoped identities. Secret values stay in an approved secret store; operational state stores references and metadata only."],
      ["High-risk controls", "Destructive data commands, production changes, access changes, force pushes, purchases, irreversible browser submissions, unbounded deletes, merges, and federation transitions require explicit recorded policy authorization."],
      ["Federation", "A restricted domain needs separate credentials, logs, memory namespace, provider configuration, and a sanitizing status protocol before any approved federation. Personal services cannot retrieve restricted source, secrets, sessions, or private memory by default."]
    ],
    requirements: [
      requirement("REQ-SEC-001", "Every schedulable object carries a security-domain label.", "Domain-label schema test."),
      requirement("REQ-SEC-002", "A domain mismatch is rejected before scoring or provider selection.", "Cross-domain routing test."),
      requirement("REQ-SEC-003", "Secret values never persist in operational state or public projections.", "Redaction fixture."),
      requirement("REQ-SEC-004", "Workers use scoped outbound identities and do not receive broad service credentials.", "Credential-scope review."),
      requirement("REQ-SEC-005", "High-risk actions require a recorded policy decision before execution.", "Approval negative tests."),
      requirement("REQ-SEC-006", "Federation remains disabled until an approved ADR and sanitizing boundary exist.", "Federation gate review.")
    ],
    acceptance: "Negative tests reject cross-domain dispatch, redact a representative attention event, and block destructive action without approval.",
    open: "Select the approved federation protocol and status-redaction policy."
  },
  {
    id: "SPEC-004",
    file: "SPEC-004-domain-data-and-identity.md",
    title: "Domain, Data and Identity Model",
    dependencies: ["SPEC-002", "SPEC-003"],
    crossReferences: ["SPEC-005", "SPEC-006", "SPEC-013", "SPEC-016"],
    purpose: "Create a durable relational model for current truth, provenance, execution, planning, evidence, and cost.",
    sections: [
      ["Core entities", "Project, Task, Run, Session, Job, Worker, Provider, SkillInstallation, AttentionItem, Artifact, Estimate, Outcome, Allocation, Event, and OutboxItem have distinct lifecycles and ownership."],
      ["Identifiers and mappings", "Internal immutable identifiers remain independent of external identifiers. External portfolio issues, Roadmap slices, pull requests, provider sessions, and consoles are represented as explicit mappings. Audit events complement mutable current-state tables."],
      ["Schemas", "Operational, planning, provider, attention, policy, audit, FinOps, analytics, and integration concerns use explicit namespaces. Derived read models never overwrite source events or operational facts."]
    ],
    requirements: [
      requirement("REQ-DATA-001", "The model distinguishes Task from Run and Run from external Session.", "Foreign-key lifecycle test."),
      requirement("REQ-DATA-002", "Internal identifiers are stable, immutable, and vendor-independent.", "ID migration fixture."),
      requirement("REQ-DATA-003", "Mutable current state is explainable by append-only audit events.", "State-to-event trace query."),
      requirement("REQ-DATA-004", "External mappings preserve provider, external ID, source timestamp, and synchronization state.", "Mapping contract test."),
      requirement("REQ-DATA-005", "Cost, estimate, attention, and evidence trace to a task and applicable run.", "Full-lineage query."),
      requirement("REQ-DATA-006", "Schema ownership uses explicit namespaces.", "Migration review.")
    ],
    acceptance: "A sample issue traces through task, run, session, attention, artifact, outcome, and allocation without reading a chat transcript.",
    open: "Choose sortable identifier format and retention periods."
  },
  {
    id: "SPEC-005",
    file: "SPEC-005-commands-events-and-idempotency.md",
    title: "Commands, Events and Idempotency Contracts",
    dependencies: ["SPEC-004"],
    crossReferences: ["SPEC-006", "SPEC-007", "SPEC-008", "SPEC-011"],
    purpose: "Specify typed intent, signed work, normalized observations, and reliable projection delivery.",
    sections: [
      ["Commands", "Natural language is parsed into a schema-validated command with actor, intent source, idempotency key, targets, required capabilities, and an optional provider preference. A command requests an authorized transition; it never directly means shell input."],
      ["Job envelopes", "A versioned job envelope carries task and run IDs, security domain, repository and worktree intent, capabilities, skills, policy envelope, lease, safe path scope, redaction policy, and callback identity."],
      ["Events and delivery", "Workers normalize observations into lifecycle, health, attention, artifact, verification, and outcome events. Internal state and outbox records write transactionally; projections deliver asynchronously with retry and dead-letter visibility."]
    ],
    requirements: [
      requirement("REQ-CONTRACT-001", "Intent validates against a versioned command schema before policy evaluation.", "Invalid-command rejection test."),
      requirement("REQ-CONTRACT-002", "Dispatched jobs have versioned signed envelopes and expiring worker leases.", "Signature and lease validation."),
      requirement("REQ-CONTRACT-003", "Events contain type, entity, source, event identity, occurrence time, ingestion time, and payload.", "Event-schema test."),
      requirement("REQ-CONTRACT-004", "Event ingestion is idempotent on source and source event ID or equivalent key.", "Duplicate-delivery test."),
      requirement("REQ-CONTRACT-005", "External projections use a transactional outbox with retry and dead-letter visibility.", "Outbox retry test."),
      requirement("REQ-CONTRACT-006", "New contract versions declare backward-compatibility behavior.", "Compatibility manifest review.")
    ],
    acceptance: "Duplicate worker events, stale leases, and retried attention delivery are handled without duplicate state or external output.",
    open: "Select signing mechanism and JSON Schema or OpenAPI toolchain."
  },
  {
    id: "SPEC-006",
    file: "SPEC-006-coordinator-runtime.md",
    title: "Coordinator Runtime",
    dependencies: ["SPEC-004", "SPEC-005"],
    crossReferences: ["SPEC-007", "SPEC-008", "SPEC-009", "SPEC-011"],
    purpose: "Define the long-running control service that coordinates work across providers, repositories, and workers.",
    sections: [
      ["Modules", "Intent Gateway, Task Service, Policy Engine, Capability Scheduler, Worker Registry, Provider Registry, Run Controller, Reconciler, Attention Manager, External Sync Engine, Estimator, Memory Curator, FinOps Allocator, and Audit Writer share typed contracts while isolating domain decisions from I/O."],
      ["Lifecycle", "Task and Run state machines are separate. Reconciliation compares desired with observed worker and provider state; a start acknowledgement is not proof of a healthy session."],
      ["Attention discipline", "Escalations include a concise Coordinator summary, exact worker question, links, and safe response actions. A reply persists before it reaches a worker session."]
    ],
    requirements: [
      requirement("REQ-COORD-001", "Policy applies before Scheduler placement.", "Dispatch ordering test."),
      requirement("REQ-COORD-002", "Security and required capability filter candidates before scoring.", "Candidate-filter test."),
      requirement("REQ-COORD-003", "A Reconciler periodically compares desired and observed state.", "Stale-session scenario."),
      requirement("REQ-COORD-004", "Attention responses persist before delivery to a session.", "Response persistence test."),
      requirement("REQ-COORD-005", "Provider acknowledgement alone is not evidence of a running job.", "False-positive start test."),
      requirement("REQ-COORD-006", "Scheduling decisions record inputs, exclusions, score rationale, and selected placement.", "Audit decision query.")
    ],
    acceptance: "A provider death becomes a recoverable attention item while preserving scheduling and policy evidence.",
    open: "Select Coordinator process topology for the first implementation slice."
  },
  {
    id: "SPEC-007",
    file: "SPEC-007-worker-runtime-and-reboot-recovery.md",
    title: "Worker Runtime and Reboot Recovery",
    dependencies: ["SPEC-005", "SPEC-006"],
    crossReferences: ["SPEC-009", "SPEC-010", "SPEC-015", "SPEC-019"],
    purpose: "Specify a small outbound worker supervisor that makes a host a recoverable execution node while retaining recovery authority in the Coordinator.",
    sections: [
      ["Responsibilities", "A worker registers, reports a versioned capability and skill manifest, sends heartbeats, validates leased jobs, starts and observes local provider processes, emits normalized events, collects artifacts, applies safety hooks, and handles cancellation."],
      ["Boot and restart", "The supervisor starts after boot without user login, restores connectivity, reports health, and remains idle. It never restarts an agent solely because the operating system restarted; the Coordinator decides whether prior work is resumable, stale, cancelled, or needs attention."],
      ["Local validation", "Before launch, the worker validates domain, capabilities, skills, path scope, resource budget, tools, credential references, and lease validity. Failure returns a structured rejection rather than partial execution."]
    ],
    requirements: [
      requirement("REQ-WORKER-001", "The worker supervisor starts and registers after reboot without user login.", "Reboot-and-register test."),
      requirement("REQ-WORKER-002", "Workers validate compatibility, policy envelope, resource budget, and lease before launch.", "Preflight rejection matrix."),
      requirement("REQ-WORKER-003", "Workers report a versioned capability and skill manifest.", "Manifest conformance test."),
      requirement("REQ-WORKER-004", "Workers emit normalized lifecycle and health events with idempotency identifiers.", "Event-client test."),
      requirement("REQ-WORKER-005", "Agent processes do not blindly restart after host boot.", "Post-reboot no-auto-resume test."),
      requirement("REQ-WORKER-006", "Workers expose safe cancellation and inspection paths.", "Cancellation recovery test.")
    ],
    acceptance: "A rebooted worker reports health, accepts a harmless valid job, and rejects expired or resource-incompatible work.",
    open: "Select service managers for the supported host operating systems."
  },
  {
    id: "SPEC-008",
    file: "SPEC-008-provider-sdk-and-capability-routing.md",
    title: "Provider SDK and Capability Routing",
    dependencies: ["SPEC-005", "SPEC-006"],
    crossReferences: ["SPEC-007", "SPEC-009", "SPEC-017"],
    purpose: "Choose execution by declared capability rather than binding the architecture to one provider or undocumented UI automation.",
    sections: [
      ["Provider contract", "A provider implements capability inspection, environment validation, start, input, inspection, pause, resume, cancellation, and artifact collection. It returns typed observations and never updates task state directly."],
      ["Initial providers", "Two CLI providers establish the normalized v1 path. An observation console stays isolated. PrintProvider renders planned launch with no execution. Manual SSH is a structured handoff, not autonomous orchestration."],
      ["Routing", "Security, operating system, repository, capability, skill, credential, and resource prerequisites filter placements before affinity, load, recovery, preference, duration, and cost scoring. Browser and visual work normally prefers an approved interactive worker; headless long-running work prefers approved long-running workers."]
    ],
    requirements: [
      requirement("REQ-PROVIDER-001", "Each provider implements the common lifecycle contract or declares unsupported operations.", "Provider conformance suite."),
      requirement("REQ-PROVIDER-002", "Tasks declare capabilities and do not require a vendor name absent explicit human preference.", "Capability-routing test."),
      requirement("REQ-PROVIDER-003", "Provider observations normalize before affecting run state.", "Normalization fixture."),
      requirement("REQ-PROVIDER-004", "PrintProvider renders a no-execution plan for every contract test.", "Dry-run test."),
      requirement("REQ-PROVIDER-005", "Desktop and browser providers declare maturity and supported automation controls.", "Maturity-manifest check."),
      requirement("REQ-PROVIDER-006", "Browser tasks declare allowed domains and write authority before launch.", "Browser-policy test.")
    ],
    acceptance: "A bounded fixture is planned via PrintProvider and run through both CLI providers with equivalent state transitions and artifacts.",
    open: "Select the first CLI provider and confirm its stable supported control surface."
  },
  {
    id: "SPEC-009",
    file: "SPEC-009-hooks-health-and-safeguards.md",
    title: "Hooks, Health and Safeguards",
    dependencies: ["SPEC-006", "SPEC-007"],
    crossReferences: ["SPEC-010", "SPEC-016", "SPEC-017"],
    purpose: "Make host stewardship enforceable even when agents hang, drift, or create worktrees faster than they finish.",
    sections: [
      ["Hook layers", "Harness, worker, Coordinator, and independent periodic monitor hooks return audited ALLOW, WARN, BLOCK, REQUIRE_APPROVAL, REMEDIATE, or QUARANTINE_WORKER decisions."],
      ["Resource and command guardrails", "Workers check disk, worktree count, active work, CPU and memory pressure, log and temporary-data growth, stale sessions, orphan processes, and reboot state before risky actions. Periodic sweeps remain mandatory when an agent is hung."],
      ["Remediation", "The system warns and drains a worker, blocks new jobs, proposes safe cleanup, and can quarantine it. Cleanup defaults to dry-run and preserves active worktrees and session evidence."]
    ],
    requirements: [
      requirement("REQ-SAFE-001", "Worktree creation and provider launch obey configured free-disk and worktree-count limits.", "Disk and worktree gate tests."),
      requirement("REQ-SAFE-002", "Health monitoring runs independently of agent turn completion.", "Hung-agent monitor test."),
      requirement("REQ-SAFE-003", "Broad or recursive deletion is intercepted before execution and resolved to approved explicit targets.", "Deletion-guard matrix."),
      requirement("REQ-SAFE-004", "Cleanup defaults to dry-run and preserves active evidence.", "Cleanup dry-run test."),
      requirement("REQ-SAFE-005", "Stale sessions and orphaned processes create auditable health findings.", "Orphan-process fixture."),
      requirement("REQ-SAFE-006", "A critical worker is drainable and quarantinable before additional dispatch.", "Quarantine routing test."),
      requirement("REQ-SAFE-007", "Hook decisions record policy version, evidence, decision, and remediation outcome.", "Hook-audit query.")
    ],
    acceptance: "Resource collapse, stale session, and unsafe delete fixtures yield blocks, evidence, and recoverable operator actions without harming a host.",
    open: "Calibrate resource thresholds per approved worker class."
  },
  {
    id: "SPEC-010",
    file: "SPEC-010-network-and-host-bootstrap.md",
    title: "Network and Host Bootstrap",
    dependencies: ["SPEC-003", "SPEC-007"],
    crossReferences: ["SPEC-009", "SPEC-015", "SPEC-019"],
    purpose: "Define the minimal physical and network preparation required before AgentOps worker software is installed.",
    sections: [
      ["Minimum baseline", "An approved personal host needs unattended private-network reachability, automatic secure-shell service, a dedicated authorized administrator account, a no-sleep policy while powered, approved physical placement, and post-reboot recovery verification."],
      ["Remote visual access", "RustDesk is a managed, human-operated visual recovery and inspection portal. It is optional to worker startup, does not replace the Coordinator's outbound connection, and cannot authorize scheduling or provider actions."],
      ["Bootstrap order", "Establish owner consent, reachability, power, cooling, and reboot recovery before remotely adding development tools, providers, skills, or worker services."]
    ],
    requirements: [
      requirement("REQ-NET-001", "Each approved personal worker is reachable through approved private networking after reboot without user login.", "Post-reboot secure-shell test."),
      requirement("REQ-NET-002", "Secure-shell access starts automatically and is limited by approved network policy.", "Service and access test."),
      requirement("REQ-NET-003", "Each worker uses a dedicated authorized account rather than an owner's daily account.", "Host inventory review."),
      requirement("REQ-NET-004", "A worker has an owner-approved physical operating location and powered no-sleep configuration.", "In-person checklist."),
      requirement("REQ-NET-005", "RustDesk or equivalent visual access is optional recovery tooling, not a worker-start dependency.", "Headless visual-access test."),
      requirement("REQ-NET-006", "Bootstrap records disclose preboot conditions that can prevent remote recovery.", "Host record validation.")
    ],
    acceptance: "A rebooted personal worker is reachable through approved remote terminal access; the optional GUI portal is never required to start the worker.",
    open: "Select private-network, RustDesk relay, and device-enrollment topology for each private deployment."
  },
  {
    id: "SPEC-011",
    file: "SPEC-011-roadmap-portfolio-github-and-chat-integration.md",
    title: "Roadmap, Portfolio, GitHub and Chat Integration",
    dependencies: ["SPEC-002", "SPEC-005"],
    crossReferences: ["SPEC-006", "SPEC-008", "SPEC-017"],
    purpose: "Compose existing planning, delivery, and communication tools while operational truth remains in AgentOps.",
    sections: [
      ["Roadmap", "Roadmap owns repository-local slices, dependencies, file contention, safe waves, worktrees, gates, and launch readiness. AgentOps asks Roadmap what can run and records the returned intent; it does not recreate that graph."],
      ["Portfolio and GitHub", "A portfolio tracker receives human-scale progress. GitHub remains source of branches, commits, pull requests, reviews, and CI evidence. A task can map to multiple slices and runs without forcing a one-to-one model."],
      ["Chat", "Chat is a direct-report and attention surface for concise summaries, exact worker questions, safe response actions, and links. It does not create a channel per session or become the only store of an approval."]
    ],
    requirements: [
      requirement("REQ-INT-001", "AgentOps calls Roadmap for readiness, waves, gates, and worktree preparation.", "Roadmap adapter scenario."),
      requirement("REQ-INT-002", "Roadmap dispatch carries task and run IDs and returns stable slice and worktree references.", "Correlation contract test."),
      requirement("REQ-INT-003", "Portfolio projections contain only meaningful human-scale transitions.", "Noise-suppression test."),
      requirement("REQ-INT-004", "Tasks support explicit mappings to issues, slices, pull requests, and external sessions.", "Multi-link lineage test."),
      requirement("REQ-INT-005", "Chat escalation separates Coordinator summary from exact worker question.", "Verbatim-question UI test."),
      requirement("REQ-INT-006", "Integration writes use the outbox and preserve retriable delivery state.", "Integration replay test.")
    ],
    acceptance: "A bounded issue maps to a Roadmap slice, produces a draft pull request, yields one attention item, and projects only meaningful transitions.",
    open: "Select the first portfolio and chat adapters after the core path is proven."
  },
  {
    id: "SPEC-012",
    file: "SPEC-012-agent-skills-and-primitives.md",
    title: "Agent Skills and Primitives",
    dependencies: ["SPEC-007", "SPEC-008"],
    crossReferences: ["SPEC-009", "SPEC-013", "SPEC-017"],
    purpose: "Define portable behavioral packages and honest enforcement across coding-agent harnesses.",
    sections: [
      ["Source and build model", "A separate primitives repository owns harness-neutral primitives and installable bundles. Each primitive declares tools, capabilities, read/write contract, security domains, outputs, and enforcement truth. AgentOps renders appropriate forms per harness."],
      ["Initial bundle", "The core bundle includes slice execution, authentication handoff, blocker escalation, completion reporting, verification gate, GitHub delivery, and FinOps reporting. Runtime facts and credentials remain in the Coordinator and secret store, never prompts."],
      ["Versioning and routing", "Workers report installed bundle and primitive versions. Jobs may require semver ranges; missing or insufficient enforced skills reject dispatch."]
    ],
    requirements: [
      requirement("REQ-SKILL-001", "Every primitive declares purpose, capabilities, security domains, output contract, and harness-specific enforcement.", "Manifest schema validation."),
      requirement("REQ-SKILL-002", "Primitives remain portable and do not embed host availability, session IDs, or secrets.", "Static skill audit."),
      requirement("REQ-SKILL-003", "Workers report installed skill and bundle versions in their capability manifest.", "Worker manifest test."),
      requirement("REQ-SKILL-004", "The Coordinator rejects a job with an absent or incompatible required enforced skill.", "Missing-skill dispatch test."),
      requirement("REQ-SKILL-005", "Policy enforcement uses deterministic code where practical.", "Enforcement classification review."),
      requirement("REQ-SKILL-006", "Authentication and reporting skills redact secrets while preserving operational details.", "Redaction and relay test.")
    ],
    acceptance: "A missing required authentication skill blocks dispatch, then a declared installation path produces a redacted attention item.",
    open: "Define bundle distribution and signing mechanism."
  },
  {
    id: "SPEC-013",
    file: "SPEC-013-estimation-finops-and-planning-feedback.md",
    title: "Estimation, FinOps and Planning Feedback",
    dependencies: ["SPEC-004", "SPEC-011"],
    crossReferences: ["SPEC-012", "SPEC-016", "SPEC-018"],
    purpose: "Measure consumption and delivery outcomes so planning improves without confusing accounting, telemetry, and quality.",
    sections: [
      ["Estimation", "An independent transparent estimator predicts agent-native rounds and low, expected, and high wall-clock ranges, supports re-estimation, and calibrates from outcomes. Agent execution, wall clock, human attention, blocked time, verification, provider, worker, risk, and outcome remain distinct."],
      ["Cost model", "Accounting remains source of truth for invoices and transactions. AgentOps records usage, pools, subscriptions, rate cards, allocation methods, and task attribution. Direct, fully loaded, human-inclusive, and failure-adjusted costs are distinct and versioned."],
      ["Planning feedback", "Observed delivery links to portfolio context and acceptance results. AgentOps can learn correlations between estimates, effort, duration, retries, cost, acceptance, and reopen rate without silently redefining relative planning points as money."]
    ],
    requirements: [
      requirement("REQ-FINOPS-001", "Estimates retain ranges, basis, model, and calibration history.", "Estimate lineage test."),
      requirement("REQ-FINOPS-002", "Agent, human, blocked, and verification time remain separate measures.", "Time-accounting fixture."),
      requirement("REQ-FINOPS-003", "Rate cards and allocation methods are versioned rather than hardcoded in prompts.", "Rate-card review."),
      requirement("REQ-FINOPS-004", "Cost records trace to task and applicable run.", "Allocation lineage query."),
      requirement("REQ-FINOPS-005", "Accounting transactions remain outside AgentOps operational truth.", "System-of-record review."),
      requirement("REQ-FINOPS-006", "Planning feedback does not silently convert relative points to currency.", "Projection contract test.")
    ],
    acceptance: "One accepted task has traceable estimate, observed time, human attention, direct cost, fixed-cost allocation, and a linked planning record.",
    open: "Select initial rate-card import and allocation defaults."
  },
  {
    id: "SPEC-014",
    file: "SPEC-014-memory-adrs-and-graph.md",
    title: "Memory, ADRs and Graph",
    dependencies: ["SPEC-002", "SPEC-004"],
    crossReferences: ["SPEC-012", "SPEC-016", "SPEC-018"],
    purpose: "Preserve architectural decisions and temporal context without promoting raw chat or agent conclusions to canonical truth.",
    sections: [
      ["Authority model", "Git-backed ADRs are canonical human-readable architecture records. A temporal retrieval graph ingests accepted ADRs and curated episodes but is derived from reviewed sources. Workers may submit candidates but cannot freely write canonical truth."],
      ["Decision lifecycle", "Candidates move through proposed, accepted, superseded, revoked, or rejected states with source evidence, validity windows, supersession links, ADR path, retrieval identifier, security domain, and applicable repositories."],
      ["Deployment", "Memory retrieval improves context but cannot block authorization or core run state. Persistent backend choice, access, and backup are deferred deployment decisions."]
    ],
    requirements: [
      requirement("REQ-MEMORY-001", "ADRs are the canonical architectural record.", "ADR review."),
      requirement("REQ-MEMORY-002", "Memory ingestion starts from accepted ADRs and curated sources.", "Curation pipeline test."),
      requirement("REQ-MEMORY-003", "Workers submit candidates but cannot write canonical truth directly.", "Write-authorization test."),
      requirement("REQ-MEMORY-004", "Supersession preserves prior rationale and validity history.", "Supersession scenario."),
      requirement("REQ-MEMORY-005", "Memory records retain security-domain labels.", "Domain-filter test."),
      requirement("REQ-MEMORY-006", "Memory retrieval failure does not block core scheduling or authorization.", "Outage fixture.")
    ],
    acceptance: "An accepted ADR is retrieved as context and later superseded while its historical rationale remains available.",
    open: "Select persistent graph backend and retention policy."
  },
  {
    id: "SPEC-015",
    file: "SPEC-015-deployment-upgrades-and-disaster-recovery.md",
    title: "Deployment, Upgrades and Disaster Recovery",
    dependencies: ["SPEC-007", "SPEC-010"],
    crossReferences: ["SPEC-016", "SPEC-017", "SPEC-019"],
    purpose: "Make host replacement, recovery, and provider upgrades controlled deployment operations rather than re-architecture.",
    sections: [
      ["Repository and environments", "The public repository contains the Coordinator, worker, providers, contracts, policies, example fleet configuration, migrations, deployment definitions, runbooks, ADRs, tests, and its Roadmap. Secret values remain outside Git."],
      ["Versioning and upgrades", "Coordinator API, worker runtime, provider SDK, providers, skills, policies, database, job, and event schemas version independently. Workers report compatible ranges. Releases progress through development, canary, and stable channels."],
      ["Recovery", "Operational durability is independent of a host restart. Workers restore outbound connectivity after boot. Backups cover state, configuration, persistent memory data, and documented secret references. Replacement follows bootstrap, registration, validation, provisioning, health, and controlled drain."]
    ],
    requirements: [
      requirement("REQ-DEPLOY-001", "Deployment configuration and secret references are version-controlled separately from secret values.", "Configuration review."),
      requirement("REQ-DEPLOY-002", "Runtime, provider, policy, and schema compatibility ranges are explicit.", "Compatibility manifest test."),
      requirement("REQ-DEPLOY-003", "Releases promote development to canary to stable with a recorded compatibility check.", "Promotion record."),
      requirement("REQ-DEPLOY-004", "Migrations are append-only and favor expand-before-contract.", "Migration review."),
      requirement("REQ-DEPLOY-005", "Destructive migrations need backup, approval, and forward repair instructions.", "Migration gate test."),
      requirement("REQ-DEPLOY-006", "Host replacement preserves task ledger and follows controlled enrollment.", "Replacement rehearsal.")
    ],
    acceptance: "A simulated canary upgrade, incompatible-job rejection, and worker replacement preserve the ledger and restore fleet health.",
    open: "Select environment topology and backup operators."
  },
  {
    id: "SPEC-016",
    file: "SPEC-016-observability-operations-and-runbooks.md",
    title: "Observability, Operations and Runbooks",
    dependencies: ["SPEC-004", "SPEC-007", "SPEC-009"],
    crossReferences: ["SPEC-013", "SPEC-015", "SPEC-017"],
    purpose: "Make the platform legible when healthy, degraded, or failing through a bounded attention inbox and recovery procedures.",
    sections: [
      ["Signals", "Workers report heartbeat, service state, provider health, session liveness, queue age, attention age, resource pressure, worktrees, processes, logs, reboot state, skill drift, outbox backlog, delivery failures, estimate error, human attention, and outcome quality."],
      ["Views and alerts", "Correlation keys include task, run, session, worker, provider, and security domain. Alerts are actionable attention items with severity, evidence, impact, suggested action, runbook link, and escalation deadline; ordinary progress remains quiet."],
      ["Runbooks", "Runbooks begin with safest diagnostics and state when owner or organization input is required. They cover offline hosts, access failures, private-network issues, low disk, processes, stale providers, outbox failures, migrations, worktrees, credentials, and reboot recovery."]
    ],
    requirements: [
      requirement("REQ-OPS-001", "Health, logs, metrics, and traces correlate with core IDs and security domain.", "Correlation query."),
      requirement("REQ-OPS-002", "Redaction occurs before persistence or human-scale projection.", "Redaction test."),
      requirement("REQ-OPS-003", "Critical resource floors, lost heartbeat, stale session, repeated provider failure, outbox age, and recovery failures produce actionable attention.", "Alert scenario suite."),
      requirement("REQ-OPS-004", "Normal successful runs remain quiet.", "Noise-suppression test."),
      requirement("REQ-OPS-005", "Runbooks begin with safe diagnostics and explicit stop conditions.", "Runbook review."),
      requirement("REQ-OPS-006", "Operational dashboards answer attention, execution, health, backlog, completion, effort, and trend questions.", "Operator-view acceptance.")
    ],
    acceptance: "Lost worker, low disk, and failed projection produce distinct actionable records while normal success remains quiet.",
    open: "Select observability storage and dashboard implementation."
  },
  {
    id: "SPEC-017",
    file: "SPEC-017-testing-verification-and-release-gates.md",
    title: "Testing, Verification and Release Gates",
    dependencies: ["SPEC-001", "SPEC-004", "SPEC-005", "SPEC-009"],
    crossReferences: ["SPEC-011", "SPEC-012", "SPEC-015", "SPEC-018"],
    purpose: "Turn specifications into executable evidence and prevent code existence from being mistaken for completion.",
    sections: [
      ["Triangulation", "Every slice maps stable requirements, acceptance scenarios, Roadmap state, code and tests, and relevant ADRs. Tests span pure domain, adapters, migrations, provider/worker integration, deterministic fixtures, end-to-end fleet behavior, recovery, resources, security negatives, and manual acceptance paths."],
      ["Verification", "The implementation provider is not its own only judge. A separate verifier inspects the requested outcome, changed files, test evidence, policy compliance, and gates, then records pass, conditional pass, needs-human-review, or fail."],
      ["Acceptance fixtures", "Fixtures cover duplicate events, stale leases, missing skills, low disk, unsafe deletion, reboot, provider crash, retry, external outage, authentication handoff, browser classification, remote-access classification, and cross-domain dispatch."]
    ],
    requirements: [
      requirement("REQ-TEST-001", "Completed Roadmap slices map stable requirements and executable acceptance evidence.", "Traceability report."),
      requirement("REQ-TEST-002", "Provider adapters pass a shared contract suite using PrintProvider or deterministic fixtures.", "Provider conformance suite."),
      requirement("REQ-TEST-003", "Verification results persist separately from implementation-provider output.", "Independent-verifier test."),
      requirement("REQ-TEST-004", "Draft pull-request creation is gated by verification and policy checks.", "PR-gate test."),
      requirement("REQ-TEST-005", "Security, resource, idempotency, reboot, outage, and remote-access scenarios have negative or recovery fixtures.", "Scenario catalog review."),
      requirement("REQ-TEST-006", "Release gates block schema incompatibility, failed redaction, and unaddressed critical safety tests.", "Release-gate matrix.")
    ],
    acceptance: "Traceability shows no completed slice without evidence; end-to-end fixtures prove verified draft delivery and intentional negative cases.",
    open: "Choose the full CI provider and integration-test environment after Phase 0."
  },
  {
    id: "SPEC-018",
    file: "SPEC-018-v1-rollout-and-milestones.md",
    title: "V1 Rollout and Milestones",
    dependencies: ["SPEC-001 through SPEC-017"],
    crossReferences: ["SPEC-019", "BUILD-001"],
    purpose: "Sequence delivery so useful control arrives early and new risk is added only after evidence.",
    sections: [
      ["Phase sequence", "Phase 0 is repository governance. Later phases establish host baseline, durable core, worker safety, Roadmap adapter and PrintProvider, first CLI path, attention loop, second provider and projections, skills/FinOps, observed browser support, memory curation, and only then approved federation."],
      ["First real delivery", "The first valuable slice is intentionally thin: request, durable state, Roadmap readiness, policy, eligible worker, bounded provider, normalized event, one blocker, durable response, verifier, draft pull request, meaningful projection, and estimate/actual/cost."],
      ["Rollout safety", "Release via development, canary, and stable channels. Capture resource baselines before normal concurrent workloads. A restricted domain remains documented but disabled until policy approval and a dedicated ADR."]
    ],
    requirements: [
      requirement("REQ-ROLL-001", "Each rollout phase has an explicit exit gate and evidence location.", "Milestone report."),
      requirement("REQ-ROLL-002", "The first vertical slice proves the attention-and-delivery loop before broader automation.", "End-to-end v1 slice."),
      requirement("REQ-ROLL-003", "Runtime versions promote through development, canary, and stable with compatibility evidence.", "Promotion record."),
      requirement("REQ-ROLL-004", "Resource baselines exist before normal concurrent workloads on owner-approved workers.", "Baseline inventory."),
      requirement("REQ-ROLL-005", "Restricted-domain federation is deferred until policy approval and a dedicated ADR.", "Federation milestone gate."),
      requirement("REQ-ROLL-006", "A phase updates specifications, evidence, Roadmap state, and status records together.", "Governance consistency check.")
    ],
    acceptance: "The Roadmap represents each phase and its gate; the first vertical slice runs in a disposable repository before use on a production repository.",
    open: "Choose the first bounded disposable repository and issue."
  },
  {
    id: "SPEC-019",
    file: "SPEC-019-host-inventory-and-initial-fleet.md",
    title: "Host Inventory and Initial Fleet Configuration",
    dependencies: ["SPEC-003", "SPEC-007", "SPEC-010"],
    crossReferences: ["SPEC-008", "SPEC-009", "SPEC-015", "SPEC-018"],
    purpose: "Keep worker enrollment configuration-driven while enforcing ownership, domain, capability, and resource safeguards.",
    sections: [
      ["Reference roles", "A generalized fleet may include an interactive visual worker, one or more long-running workers, and a restricted-domain inventory record. Names, accounts, network values, locations, and hardware details are private deployment data and never public template values."],
      ["Configuration shape", "Every worker record holds worker ID, owner permission, operating system, security domain, allowed repository patterns, providers, capabilities, resource policy, current status, heartbeat, service state, credential references, skills, remote-access profile, and bootstrap verification time."],
      ["Enrollment and care", "A new owner-approved worker needs physical-location and cooling review, dedicated account, post-boot private-network and terminal access validation, power policy, recovery constraints, resource baseline, and explicit service authorization. Routing hints never override domain, policy, compatibility, or resource safety."]
    ],
    requirements: [
      requirement("REQ-FLEET-001", "Each worker record contains owner permission, OS, domain, capabilities, resource policy, service state, credential references, and bootstrap verification.", "Fleet-config validation."),
      requirement("REQ-FLEET-002", "Interactive visual capability is advertised only when declared maturity and health support it.", "Capability-health test."),
      requirement("REQ-FLEET-003", "Long-running capability is advertised only when service, monitors, and declared work environment are healthy.", "Worker readiness test."),
      requirement("REQ-FLEET-004", "Restricted-domain inventory is present but unavailable for autonomous dispatch in v1.", "Fleet-routing negative test."),
      requirement("REQ-FLEET-005", "A future worker completes bootstrap and resource baseline before normal dispatch.", "Enrollment checklist test."),
      requirement("REQ-FLEET-006", "Routing hints never override domain, policy, compatibility, or resource constraints.", "Constraint-precedence test.")
    ],
    acceptance: "Example configuration renders generic worker roles, explains preference decisions, and refuses cross-domain placement.",
    open: "Capture real deployment inventory only in a private overlay after owner authorization."
  },
  {
    id: "BUILD-001",
    file: "BUILD-001-initial-implementation-prompt.md",
    title: "Initial AgentOps Implementation Prompt",
    dependencies: ["CAT-001", "SPEC-000 through SPEC-019"],
    crossReferences: ["CAT-001", "SPEC-000 through SPEC-019"],
    purpose: "Provide a durable starting instruction for a governed implementation session while specifications, acceptance contracts, Roadmap, and ADRs remain authoritative.",
    sections: [
      ["Mission", "Build a portable provider-neutral operating system that lets a human supervise bounded coding-agent work across approved personal workers. Compose the Roadmap, portable primitives, and independent estimator rather than recreating their authority."],
      ["Non-negotiable governance", "Read the catalog and relevant specifications before a slice. Completion requires implementation, tests, requirement mappings, Roadmap status, and ADR agreement. Models propose while policy authorizes; domains are hard filters; provider selection is capability based; durable state is not chat; external failures cannot corrupt core state."],
      ["Work cycle", "At the start, inspect catalog, status, blockers, applicable specs, Roadmap readiness, dependencies, estimate, intended implementation, tests, and risks. At the end, run relevant tests, validate Roadmap, update mappings and status, record gaps honestly, and hand off evidence and next slice."],
      ["Initial delivery order", "First create only repository governance scaffolding, specifications, ADRs, acceptance catalog, Roadmap, and validation. Do not mutate hosts or deploy production infrastructure in the bootstrap pull request. Build later vertical slices only in the documented rollout order."],
      ["Stop conditions", "Stop for conflicting specifications, destructive migration or production change, unclear security boundary, missing credentials or external authorization, unsafe undocumented automation, unsafe host, or restricted-domain authority. Otherwise continue through the Roadmap."]
    ],
    requirements: [
      requirement("REQ-BUILD-001", "An implementation session reads catalog and applicable specifications before beginning a slice.", "Cycle checklist evidence."),
      requirement("REQ-BUILD-002", "The bootstrap pull request contains governance scaffolding only and does not mutate hosts or production infrastructure.", "PR scope review."),
      requirement("REQ-BUILD-003", "The first executable vertical slice proves the attention-and-delivery loop before broader automation.", "End-to-end v1 scenario."),
      requirement("REQ-BUILD-004", "The implementation session stops for authorization, destructive-action, boundary, and unsafe-automation conditions.", "Blocked-decision record."),
      requirement("REQ-BUILD-005", "No Roadmap slice is complete on code existence alone.", "Traceability gate.")
    ],
    acceptance: "A fresh implementation session can create a governed bootstrap and keep subsequent work aligned with normative specifications.",
    open: "Revise only through the same specification and ADR change-control process."
  }
];

export const specDirectory = new URL("../docs/specs/", import.meta.url);
