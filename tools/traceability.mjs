import { documents } from "./specifications.mjs";

const route = (slice, acceptance, status, test, requirementStatus = status) => ({
  slice,
  acceptance,
  status,
  test,
  requirementStatus
});

export const routes = {
  governance: route("governed-scaffold", "ACC-GOV-001", "planned", "pnpm validate"),
  core: route("supabase-durable-core", "ACC-CORE-001", "planned", "pnpm test:unit && pnpm test:db"),
  host: route("private-host-baseline", "ACC-REMOTE-001", "gated", "private host-baseline acceptance"),
  remoteAcceptance: route("private-worker-canary", "ACC-REMOTE-001", "gated", "future private headless RemoteAccessPortal and worker-health canary"),
  worker: route("worker-runtime-core", "ACC-WORKER-001", "planned", "pnpm --filter @agent-ops/worker test"),
  safety: route("worker-safety-hooks", "ACC-WORKER-001", "complete", "pnpm --filter @agent-ops/policy test && pnpm --filter @agent-ops/worker test", "planned"),
  service: route("worker-service-packaging", "ACC-WORKER-001", "complete", "pnpm run check:service-packaging && pnpm --filter @agent-ops/test-kit test", "planned"),
  canary: route("private-worker-canary", "ACC-WORKER-001", "gated", "future private worker canary acceptance"),
  roadmap: route("roadmap-adapter", "ACC-PLANNING-001", "planned", "pnpm run check:roadmap-adapter", "planned"),
  print: route("print-provider", "ACC-PROVIDER-001", "complete", "pnpm run check:print-provider", "planned"),
  providerAcceptance: route("second-cli-provider", "ACC-PROVIDER-001", "complete", "pnpm run check:provider-conformance", "planned"),
  coordinator: route("coordinator-runtime", "ACC-ATTENTION-001", "complete", "pnpm run check:coordinator-runtime", "planned"),
  slack: route("slack-attention-adapter", "ACC-ATTENTION-001", "complete", "pnpm run check:slack-attention-adapter", "planned"),
  attentionAcceptance: route("verified-draft-delivery", "ACC-ATTENTION-001", "complete", "pnpm run check:verified-draft-delivery", "planned"),
  delivery: route("verified-draft-delivery", "ACC-DELIVERY-001", "complete", "pnpm run check:verified-draft-delivery", "planned"),
  secondProvider: route("second-cli-provider", "ACC-PROVIDER-001", "complete", "pnpm run check:provider-conformance"),
  projections: route("github-portfolio-projections", "ACC-PROJECTION-001", "planned", "pnpm run check:github-portfolio-projections"),
  skills: route("skills-estimation-finops", "ACC-SKILLS-001", "complete", "pnpm run check:skills-estimation-finops"),
  finops: route("skills-estimation-finops", "ACC-FINOPS-001", "complete", "pnpm run check:skills-estimation-finops"),
  release: route("release-recovery", "ACC-RELEASE-001", "complete", "pnpm run check:release-recovery"),
  browser: route("observed-browser-path", "ACC-BROWSER-001", "complete", "pnpm run check:observed-browser-path"),
  browserAcceptance: route("private-browser-observation-canary", "ACC-BROWSER-001", "gated", "future private human-observed browser canary"),
  memory: route("graphiti-curation", "ACC-MEMORY-001", "complete", "pnpm run check:graphiti-curation"),
  security: route("restricted-domain-federation", "ACC-SECURITY-001", "gated", "future domain, resource, destructive-action, and restricted-dispatch negative suite"),
  federation: route("restricted-domain-federation", "ACC-FEDERATION-001", "gated", "future authority, sanitization, isolation, and negative-dispatch suite")
};

export const acceptanceRoutes = [
  { ...routes.governance, status: "complete" },
  { ...routes.core, status: "complete" },
  routes.canary,
  routes.providerAcceptance,
  routes.attentionAcceptance,
  routes.security,
  routes.remoteAcceptance,
  routes.roadmap,
  routes.delivery,
  routes.projections,
  routes.skills,
  routes.finops,
  routes.release,
  routes.browserAcceptance,
  routes.memory,
  routes.federation
];

const acceptanceCompletionRoutes = new Map(
  acceptanceRoutes.map((entry) => [entry.acceptance, entry])
);

const scenarioCatalogCoverage = [
  routes.safety,
  routes.service,
  routes.canary,
  routes.remoteAcceptance,
  routes.projections,
  routes.browserAcceptance
];

const completedRequirementIds = new Set([
  "REQ-CATALOG-001",
  "REQ-CATALOG-002",
  "REQ-CATALOG-003",
  "REQ-BUILD-001",
  "REQ-BUILD-002",
  "REQ-BUILD-004",
  "REQ-BUILD-005",
  "REQ-ROLL-001",
  "REQ-ROLL-006",
  "REQ-TEST-001",
  "REQ-SEC-001",
  "REQ-SEC-002",
  "REQ-DATA-001",
  "REQ-DATA-004",
  "REQ-DATA-005",
  "REQ-DATA-006",
  "REQ-CONTRACT-001",
  "REQ-CONTRACT-003",
  "REQ-CONTRACT-004",
  "REQ-CONTRACT-005",
  "REQ-COORD-001",
  "REQ-COORD-002",
  "REQ-COORD-003",
  "REQ-COORD-004",
  "REQ-COORD-005",
  "REQ-COORD-006",
  "REQ-WORKER-002",
  "REQ-WORKER-003",
  "REQ-WORKER-004",
  "REQ-WORKER-006",
  "REQ-V1-006",
  "REQ-SEC-003",
  "REQ-DEPLOY-001",
  "REQ-CONTEXT-001",
  "REQ-INT-001",
  "REQ-INT-002",
  "REQ-SAFE-001",
  "REQ-SAFE-002",
  "REQ-SAFE-003",
  "REQ-SAFE-004",
  "REQ-SAFE-005",
  "REQ-SAFE-006",
  "REQ-SAFE-007",
  "REQ-PROVIDER-001",
  "REQ-PROVIDER-002",
  "REQ-PROVIDER-003",
  "REQ-PROVIDER-004",
  "REQ-TEST-002",
  "REQ-CHARTER-001",
  "REQ-INT-005",
  "REQ-BUILD-003",
  "REQ-V1-004",
  "REQ-V1-005",
  "REQ-TEST-003",
  "REQ-TEST-004",
  "REQ-ROLL-002",
  "REQ-V1-003",
  "REQ-CONTEXT-002",
  "REQ-CONTEXT-004",
  "REQ-CONTEXT-006",
  "REQ-INT-003",
  "REQ-INT-004",
  "REQ-INT-006",
  "REQ-SKILL-001",
  "REQ-SKILL-002",
  "REQ-SKILL-003",
  "REQ-SKILL-004",
  "REQ-SKILL-005",
  "REQ-SKILL-006",
  "REQ-FINOPS-001",
  "REQ-FINOPS-002",
  "REQ-FINOPS-003",
  "REQ-FINOPS-004",
  "REQ-FINOPS-005",
  "REQ-FINOPS-006",
  "REQ-CHARTER-006",
  "REQ-DATA-002",
  "REQ-CONTRACT-006",
  "REQ-DEPLOY-002",
  "REQ-DEPLOY-003",
  "REQ-DEPLOY-004",
  "REQ-DEPLOY-005",
  "REQ-DEPLOY-006",
  "REQ-OPS-005",
  "REQ-TEST-006",
  "REQ-ROLL-003",
  "REQ-PROVIDER-005",
  "REQ-PROVIDER-006",
  "REQ-MEMORY-001",
  "REQ-MEMORY-002",
  "REQ-MEMORY-003",
  "REQ-MEMORY-004",
  "REQ-MEMORY-005",
  "REQ-MEMORY-006",
]);

const prefixRoutes = new Map([
  ["CATALOG", "governance"],
  ["BUILD", "governance"],
  ["CHARTER", "delivery"],
  ["V1", "delivery"],
  ["CONTEXT", "core"],
  ["SEC", "core"],
  ["DATA", "core"],
  ["CONTRACT", "core"],
  ["COORD", "coordinator"],
  ["WORKER", "worker"],
  ["PROVIDER", "print"],
  ["SAFE", "safety"],
  ["NET", "canary"],
  ["INT", "projections"],
  ["SKILL", "skills"],
  ["FINOPS", "finops"],
  ["MEMORY", "memory"],
  ["DEPLOY", "release"],
  ["OPS", "coordinator"],
  ["TEST", "delivery"],
  ["ROLL", "delivery"],
  ["FLEET", "canary"]
]);

const overrides = new Map(Object.entries({
  "REQ-BUILD-003": "delivery",
  "REQ-CHARTER-001": "slack",
  "REQ-CHARTER-002": "coordinator",
  "REQ-CHARTER-003": "worker",
  "REQ-CHARTER-005": "federation",
  "REQ-CHARTER-006": "release",
  "REQ-V1-001": "worker",
  "REQ-V1-002": "coordinator",
  "REQ-V1-003": "secondProvider",
  "REQ-V1-004": "attentionAcceptance",
  "REQ-V1-006": "safety",
  "REQ-V1-007": "federation",
  "REQ-CONTEXT-001": "roadmap",
  "REQ-CONTEXT-002": "projections",
  "REQ-CONTEXT-003": "coordinator",
  "REQ-CONTEXT-004": "projections",
  "REQ-CONTEXT-005": "roadmap",
  "REQ-CONTEXT-006": "projections",
  "REQ-SEC-005": "safety",
  "REQ-SEC-006": "federation",
  "REQ-SEC-003": "safety",
  "REQ-SEC-004": "worker",
  "REQ-DATA-002": "release",
  "REQ-DATA-003": "coordinator",
  "REQ-CONTRACT-002": "worker",
  "REQ-CONTRACT-006": "release",
  "REQ-COORD-001": "core",
  "REQ-COORD-002": "core",
  "REQ-COORD-004": "coordinator",
  "REQ-WORKER-001": "service",
  "REQ-WORKER-005": "service",
  "REQ-PROVIDER-005": "browser",
  "REQ-PROVIDER-006": "browser",
  "REQ-NET-005": "remoteAcceptance",
  "REQ-INT-001": "roadmap",
  "REQ-INT-002": "roadmap",
  "REQ-INT-005": "slack",
  "REQ-DEPLOY-001": "service",
  "REQ-OPS-001": "worker",
  "REQ-OPS-002": "worker",
  "REQ-OPS-003": "safety",
  "REQ-OPS-004": "slack",
  "REQ-OPS-005": "release",
  "REQ-OPS-006": "projections",
  "REQ-TEST-001": "governance",
  "REQ-TEST-002": "print",
  "REQ-TEST-005": "browserAcceptance",
  "REQ-TEST-006": "release",
  "REQ-ROLL-001": "governance",
  "REQ-ROLL-003": "release",
  "REQ-ROLL-004": "canary",
  "REQ-ROLL-005": "federation",
  "REQ-ROLL-006": "governance",
  "REQ-FLEET-001": "host",
  "REQ-FLEET-002": "remoteAcceptance",
  "REQ-FLEET-003": "remoteAcceptance",
  "REQ-FLEET-006": "federation"
}));

const routeKeyFor = (requirementId) => {
  const explicit = overrides.get(requirementId);
  if (explicit) return explicit;
  const match = /^REQ-([A-Z0-9]+)-\d{3}$/.exec(requirementId);
  return match ? prefixRoutes.get(match[1]) : undefined;
};

const coverageFor = (requirementId) =>
  requirementId === "REQ-TEST-005"
    ? scenarioCatalogCoverage
    : undefined;

export const traceabilityEntries = documents.flatMap((document) =>
  document.requirements.map((requirement) => {
    const routeKey = routeKeyFor(requirement.id);
    const selected = routeKey ? routes[routeKey] : undefined;
    if (!selected) throw new Error(`No traceability route for ${requirement.id}`);
    const coverage = coverageFor(requirement.id);
    const acceptanceCompletion =
      acceptanceCompletionRoutes.get(selected.acceptance);
    if (!acceptanceCompletion) {
      throw new Error(
        `No canonical acceptance completion route for ${requirement.id}`
      );
    }
    const status = completedRequirementIds.has(requirement.id)
      ? "complete"
      : coverage?.some((entry) => entry.status === "gated")
        ? "gated"
        : selected.requirementStatus;
    return {
      id: requirement.id,
      owner: document.id,
      ...selected,
      status,
      routeRole: (
        selected.slice === acceptanceCompletion.slice &&
        selected.test === acceptanceCompletion.test
      )
        ? "completion"
        : "contributing",
      ...(coverage
        ? {
            coveragePolicy: "all",
            coverage
          }
        : {}),
      requiredEvidence: requirement.evidence
    };
  })
);

const scalar = (value) => JSON.stringify(value);

export const renderTraceability = () => [
  "# Generated requirement-to-slice-to-test report; edit tools/traceability.mjs.",
  "# acceptance_routes are canonical completion gates; contributing requirement routes provide prerequisite evidence.",
  "schema_version: 1",
  "acceptance_routes:",
  ...acceptanceRoutes.flatMap((entry) => [
    `  - id: ${entry.acceptance}`,
    `    slice: ${entry.slice}`,
    `    status: ${entry.status}`,
    `    test: ${scalar(entry.test)}`
  ]),
  "requirements:",
  ...traceabilityEntries.flatMap((entry) => {
    const rendered = [
      `  - id: ${entry.id}`,
      `    owner: ${entry.owner}`,
      `    slice: ${entry.slice}`,
      `    acceptance: ${entry.acceptance}`,
      `    status: ${entry.status}`,
      `    route_role: ${entry.routeRole}`,
      `    test: ${scalar(entry.test)}`,
      `    required_evidence: ${scalar(entry.requiredEvidence)}`
    ];
    if (entry.coverage) {
      rendered.push(
        `    coverage_policy: ${entry.coveragePolicy}`,
        "    coverage:",
        ...entry.coverage.flatMap((coverage) => [
          `      - slice: ${coverage.slice}`,
          `        acceptance: ${coverage.acceptance}`,
          `        status: ${coverage.status}`,
          `        test: ${scalar(coverage.test)}`
        ])
      );
    }
    return rendered;
  }),
  ""
].join("\n");
