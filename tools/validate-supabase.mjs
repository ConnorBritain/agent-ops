import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const config = await readFile(path.join(root, "supabase/config.toml"), "utf8");
const migrationDirectory = path.join(root, "supabase/migrations");
const migrationNames = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith(".sql"))
  .sort();

const uncommentedConfig = config
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("#"))
  .join("\n");

if (migrationNames.length === 0) errors.push("At least one Supabase migration is required.");
if (!uncommentedConfig.includes('schemas = ["agentops"]')) {
  errors.push("Only the explicit agentops API schema may be exposed.");
}
if (/auto_expose_new_tables\s*=\s*true/.test(uncommentedConfig)) {
  errors.push("Supabase Data API auto-exposure must remain disabled.");
}

const sql = (
  await Promise.all(
    migrationNames.map((name) => readFile(path.join(migrationDirectory, name), "utf8")),
  )
).join("\n");

const requiredTables = [
  "security_domains",
  "principals",
  "projects",
  "providers",
  "workers",
  "tasks",
  "runs",
  "policy_decisions",
  "sessions",
  "coordinator_leases",
  "jobs",
  "skill_installations",
  "attention_items",
  "artifacts",
  "estimates",
  "outcomes",
  "allocations",
  "external_mappings",
];

for (const table of requiredTables) {
  if (!sql.includes(`create table agentops.${table}`)) {
    errors.push(`Missing durable-core table agentops.${table}.`);
  }
  for (const mode of ["enable", "force"]) {
    if (!sql.includes(`alter table agentops.${table} ${mode} row level security`)) {
      errors.push(`agentops.${table} must ${mode} row level security.`);
    }
  }
}

for (const table of ["events", "outbox_items"]) {
  if (!sql.includes(`create table agentops_audit.${table}`)) {
    errors.push(`Missing audit table agentops_audit.${table}.`);
  }
  for (const mode of ["enable", "force"]) {
    if (!sql.includes(`alter table agentops_audit.${table} ${mode} row level security`)) {
      errors.push(`agentops_audit.${table} must ${mode} row level security.`);
    }
  }
}

for (const marker of [
  "create trigger events_append_only",
  "create trigger events_enqueue_outbox",
  "create policy jobs_select_assigned",
  "create or replace function agentops.acquire_coordinator_lease",
  "create or replace function agentops.validate_fencing_token",
  "create or replace function agentops.create_job",
  "create or replace function agentops.record_worker_event",
  "event lineage is not assigned to the calling worker",
  "for update;",
  "v_job.worker_id is distinct from p_worker_id",
  "for update skip locked",
  "outbox_processing_lock_idx",
  "DELIVERY_TIMEOUT",
  "security_invoker = true",
  "worker lease must expire in the future",
  "an applicable allow policy decision is required before dispatch",
  "task, run, worker, and provider domains and availability must permit dispatch",
  "inline secret-like data is forbidden",
]) {
  if (!sql.includes(marker)) errors.push(`Supabase migration is missing required marker: ${marker}`);
}

const functionDefinitions = sql
  .split(/create\s+(?:or\s+replace\s+)?function/i)
  .slice(1);
for (const definition of functionDefinitions) {
  const preamble = definition.split("$$", 1)[0] ?? "";
  if (
    /security\s+definer/i.test(preamble)
    && !/set\s+search_path\s*=\s*''/i.test(preamble)
  ) {
    const name = preamble.trim().split(/[\s(]/, 1)[0] || "<unknown>";
    errors.push(`SECURITY DEFINER function ${name} must set an empty search_path.`);
  }
}
if (/create\s+extension[^;\n]*\bversion\b/i.test(sql)) {
  errors.push("Extension versions must not be pinned in migrations.");
}
if (/\bgrant\b[\s\S]{0,200}\bto\s+anon\b/i.test(sql)) {
  errors.push("The anonymous role must not receive AgentOps privileges.");
}
if (/(xox[baprs]-[A-Za-z0-9-]{20,}|xapp-[A-Za-z0-9-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sb_secret_[A-Za-z0-9_-]{20,})/.test(sql)) {
  errors.push("Migration contains a token-like value.");
}

if (errors.length) {
  console.error("Supabase validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Supabase validation passed for ${migrationNames.length} migration(s) and ${requiredTables.length + 2} RLS tables.`);
}
