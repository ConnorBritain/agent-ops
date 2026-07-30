create extension if not exists pgcrypto with schema extensions;

create schema if not exists agentops;
create schema if not exists agentops_audit;
create schema if not exists agentops_private;

revoke all on schema agentops from public, anon;
revoke all on schema agentops_audit from public, anon, authenticated;
revoke all on schema agentops_private from public, anon;

grant usage on schema agentops to authenticated, service_role;
grant usage on schema agentops_audit to service_role;
grant usage on schema agentops_private to authenticated, service_role;

create table agentops.security_domains (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,62}$'),
  display_name text not null check (length(display_name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table agentops.principals (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  kind text not null check (kind in ('human', 'coordinator', 'worker', 'integration')),
  security_domain_id text not null references agentops.security_domains(id) on update restrict on delete restrict,
  display_name text not null check (length(display_name) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table agentops.projects (
  id uuid primary key default gen_random_uuid(),
  security_domain_id text not null references agentops.security_domains(id) on update restrict on delete restrict,
  name text not null check (length(name) between 1 and 200),
  state text not null default 'active' check (state in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (security_domain_id, name)
);

create table agentops.providers (
  id uuid primary key default gen_random_uuid(),
  security_domain_id text not null references agentops.security_domains(id) on update restrict on delete restrict,
  provider_key text not null,
  state text not null default 'disabled' check (state in ('disabled', 'available', 'degraded', 'unavailable')),
  capability_manifest jsonb not null default '[]'::jsonb check (jsonb_typeof(capability_manifest) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (security_domain_id, provider_key)
);

create table agentops.workers (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null unique references agentops.principals(id) on update restrict on delete restrict,
  security_domain_id text not null references agentops.security_domains(id) on update restrict on delete restrict,
  worker_key text not null,
  state text not null default 'offline' check (state in ('offline', 'starting', 'ready', 'busy', 'draining', 'quarantined')),
  capabilities jsonb not null default '[]'::jsonb check (jsonb_typeof(capabilities) = 'array'),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (security_domain_id, worker_key)
);

create table agentops.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references agentops.projects(id) on update restrict on delete restrict,
  security_domain_id text not null references agentops.security_domains(id) on update restrict on delete restrict,
  title text not null check (length(title) between 1 and 500),
  state text not null default 'proposed' check (state in ('proposed', 'ready', 'running', 'attention', 'complete', 'cancelled')),
  created_by_principal_id uuid not null references agentops.principals(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table agentops.runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references agentops.tasks(id) on update restrict on delete restrict,
  security_domain_id text not null references agentops.security_domains(id) on update restrict on delete restrict,
  desired_state text not null default 'queued' check (desired_state in ('queued', 'running', 'paused', 'cancelled', 'complete')),
  observed_state text not null default 'pending' check (observed_state in ('pending', 'starting', 'running', 'paused', 'attention', 'failed', 'cancelled', 'complete', 'unknown')),
  selected_worker_id uuid references agentops.workers(id) on update restrict on delete restrict,
  selected_provider_id uuid references agentops.providers(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table agentops.policy_decisions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references agentops.tasks(id) on update restrict on delete restrict,
  run_id uuid references agentops.runs(id) on update restrict on delete restrict,
  security_domain_id text not null references agentops.security_domains(id) on update restrict on delete restrict,
  action text not null check (length(action) between 1 and 120),
  decision text not null check (decision in ('allow', 'deny', 'requires-approval')),
  risk_level text not null check (risk_level in ('low', 'medium', 'high', 'critical')),
  recorded_by_principal_id uuid not null references agentops.principals(id) on update restrict on delete restrict,
  input jsonb not null default '{}'::jsonb check (jsonb_typeof(input) = 'object'),
  rationale text not null check (length(rationale) between 1 and 2000),
  recorded_at timestamptz not null default now()
);

create table agentops.sessions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agentops.runs(id) on update restrict on delete restrict,
  provider_id uuid not null references agentops.providers(id) on update restrict on delete restrict,
  security_domain_id text not null references agentops.security_domains(id) on update restrict on delete restrict,
  external_session_id text,
  observed_state text not null default 'pending' check (observed_state in ('pending', 'starting', 'running', 'paused', 'attention', 'failed', 'cancelled', 'complete', 'unknown')),
  source_observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, external_session_id)
);

create table agentops.coordinator_leases (
  lease_name text primary key check (lease_name ~ '^[a-z][a-z0-9-]{1,62}$'),
  holder_principal_id uuid not null references agentops.principals(id) on update restrict on delete restrict,
  fencing_token bigint not null check (fencing_token > 0),
  acquired_at timestamptz not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null,
  check (expires_at > acquired_at)
);

create table agentops.jobs (
  id uuid primary key,
  task_id uuid not null references agentops.tasks(id) on update restrict on delete restrict,
  run_id uuid not null references agentops.runs(id) on update restrict on delete restrict,
  worker_id uuid not null references agentops.workers(id) on update restrict on delete restrict,
  provider_id uuid not null references agentops.providers(id) on update restrict on delete restrict,
  security_domain_id text not null references agentops.security_domains(id) on update restrict on delete restrict,
  policy_decision_id uuid not null references agentops.policy_decisions(id) on update restrict on delete restrict,
  coordinator_principal_id uuid not null references agentops.principals(id) on update restrict on delete restrict,
  coordinator_lease_name text not null references agentops.coordinator_leases(lease_name) on update restrict on delete restrict,
  fencing_token bigint not null check (fencing_token > 0),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  envelope_version text not null check (envelope_version ~ '^[0-9]+\.[0-9]+$'),
  envelope jsonb not null check (jsonb_typeof(envelope) = 'object'),
  signature_key_ref text not null check (signature_key_ref ~ '^secret://[a-zA-Z0-9/_-]+$'),
  signature text not null check (length(signature) between 32 and 4096),
  lease_expires_at timestamptz not null,
  state text not null default 'queued' check (state in ('queued', 'claimed', 'running', 'paused', 'attention', 'failed', 'cancelled', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, idempotency_key)
);

create table agentops.skill_installations (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references agentops.workers(id) on update restrict on delete restrict,
  security_domain_id text not null references agentops.security_domains(id) on update restrict on delete restrict,
  skill_key text not null,
  version text not null,
  state text not null default 'declared' check (state in ('declared', 'installed', 'verified', 'disabled')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worker_id, skill_key, version)
);

create table agentops.attention_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references agentops.tasks(id) on update restrict on delete restrict,
  run_id uuid references agentops.runs(id) on update restrict on delete restrict,
  security_domain_id text not null references agentops.security_domains(id) on update restrict on delete restrict,
  type text not null check (type in ('question', 'approval', 'authentication', 'review', 'security', 'infrastructure', 'failure')),
  state text not null default 'open' check (state in ('open', 'answered', 'resolved', 'expired')),
  summary text not null check (length(summary) between 1 and 1000),
  verbatim_question text,
  durable_response jsonb,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create table agentops.artifacts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references agentops.tasks(id) on update restrict on delete restrict,
  run_id uuid references agentops.runs(id) on update restrict on delete restrict,
  security_domain_id text not null references agentops.security_domains(id) on update restrict on delete restrict,
  kind text not null,
  uri_ref text not null,
  digest text,
  created_at timestamptz not null default now()
);

create table agentops.estimates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references agentops.tasks(id) on update restrict on delete restrict,
  run_id uuid references agentops.runs(id) on update restrict on delete restrict,
  security_domain_id text not null references agentops.security_domains(id) on update restrict on delete restrict,
  method text not null,
  unit text not null,
  low numeric,
  expected numeric not null,
  high numeric,
  version text not null,
  created_at timestamptz not null default now(),
  check (expected >= 0),
  check (low is null or low >= 0),
  check (high is null or high >= expected),
  check (low is null or low <= expected)
);

create table agentops.outcomes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references agentops.tasks(id) on update restrict on delete restrict,
  run_id uuid references agentops.runs(id) on update restrict on delete restrict,
  security_domain_id text not null references agentops.security_domains(id) on update restrict on delete restrict,
  verdict text not null check (verdict in ('pass', 'conditional-pass', 'needs-human-review', 'fail')),
  summary text not null,
  verified_at timestamptz not null default now()
);

create table agentops.allocations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references agentops.tasks(id) on update restrict on delete restrict,
  run_id uuid references agentops.runs(id) on update restrict on delete restrict,
  security_domain_id text not null references agentops.security_domains(id) on update restrict on delete restrict,
  category text not null,
  quantity numeric not null check (quantity >= 0),
  unit text not null,
  amount numeric,
  currency text,
  created_at timestamptz not null default now(),
  check ((amount is null and currency is null) or (amount is not null and amount >= 0 and currency ~ '^[A-Z]{3}$'))
);

create table agentops.external_mappings (
  id uuid primary key default gen_random_uuid(),
  security_domain_id text not null references agentops.security_domains(id) on update restrict on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  provider text not null,
  external_id text not null,
  source_timestamp timestamptz not null,
  synchronization_state text not null check (synchronization_state in ('observed', 'pending', 'synchronized', 'conflict', 'failed')),
  synchronization_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(synchronization_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);

create table agentops_audit.events (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid() unique,
  version text not null check (version ~ '^[0-9]+\.[0-9]+$'),
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  security_domain_id text not null references agentops.security_domains(id) on update restrict on delete restrict,
  task_id uuid references agentops.tasks(id) on update restrict on delete restrict,
  run_id uuid references agentops.runs(id) on update restrict on delete restrict,
  source_kind text not null check (source_kind in ('human', 'coordinator', 'worker', 'provider', 'integration', 'system')),
  source_id text not null,
  source_event_id text not null,
  occurred_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  unique (source_kind, source_id, source_event_id)
);

create table agentops_audit.outbox_items (
  id bigint generated always as identity primary key,
  event_row_id bigint not null references agentops_audit.events(id) on update restrict on delete restrict,
  destination text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  state text not null default 'pending' check (state in ('pending', 'processing', 'delivered', 'dead-letter')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z0-9_.-]{1,120}$'),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (event_row_id, destination)
);

create index principals_security_domain_id_idx on agentops.principals(security_domain_id);
create index projects_security_domain_id_idx on agentops.projects(security_domain_id);
create index providers_security_domain_id_idx on agentops.providers(security_domain_id);
create index workers_security_domain_id_idx on agentops.workers(security_domain_id);
create index tasks_project_id_idx on agentops.tasks(project_id);
create index tasks_security_domain_id_idx on agentops.tasks(security_domain_id);
create index tasks_created_by_principal_id_idx on agentops.tasks(created_by_principal_id);
create index runs_task_id_idx on agentops.runs(task_id);
create index runs_security_domain_id_idx on agentops.runs(security_domain_id);
create index runs_selected_worker_id_idx on agentops.runs(selected_worker_id);
create index runs_selected_provider_id_idx on agentops.runs(selected_provider_id);
create index policy_decisions_task_id_idx on agentops.policy_decisions(task_id);
create index policy_decisions_run_id_idx on agentops.policy_decisions(run_id);
create index policy_decisions_security_domain_id_idx on agentops.policy_decisions(security_domain_id);
create index policy_decisions_recorded_by_idx on agentops.policy_decisions(recorded_by_principal_id);
create index sessions_run_id_idx on agentops.sessions(run_id);
create index sessions_provider_id_idx on agentops.sessions(provider_id);
create index sessions_security_domain_id_idx on agentops.sessions(security_domain_id);
create index coordinator_leases_holder_idx on agentops.coordinator_leases(holder_principal_id);
create index jobs_task_id_idx on agentops.jobs(task_id);
create index jobs_run_id_idx on agentops.jobs(run_id);
create index jobs_worker_id_idx on agentops.jobs(worker_id);
create index jobs_provider_id_idx on agentops.jobs(provider_id);
create index jobs_security_domain_id_idx on agentops.jobs(security_domain_id);
create index jobs_policy_decision_id_idx on agentops.jobs(policy_decision_id);
create index jobs_coordinator_principal_id_idx on agentops.jobs(coordinator_principal_id);
create index jobs_coordinator_lease_name_idx on agentops.jobs(coordinator_lease_name);
create index jobs_worker_state_created_idx on agentops.jobs(worker_id, state, created_at);
create index skill_installations_worker_id_idx on agentops.skill_installations(worker_id);
create index skill_installations_security_domain_id_idx on agentops.skill_installations(security_domain_id);
create index attention_items_task_id_idx on agentops.attention_items(task_id);
create index attention_items_run_id_idx on agentops.attention_items(run_id);
create index attention_items_security_domain_id_idx on agentops.attention_items(security_domain_id);
create index attention_items_open_idx on agentops.attention_items(created_at) where state = 'open';
create index artifacts_task_id_idx on agentops.artifacts(task_id);
create index artifacts_run_id_idx on agentops.artifacts(run_id);
create index artifacts_security_domain_id_idx on agentops.artifacts(security_domain_id);
create index estimates_task_id_idx on agentops.estimates(task_id);
create index estimates_run_id_idx on agentops.estimates(run_id);
create index estimates_security_domain_id_idx on agentops.estimates(security_domain_id);
create index outcomes_task_id_idx on agentops.outcomes(task_id);
create index outcomes_run_id_idx on agentops.outcomes(run_id);
create index outcomes_security_domain_id_idx on agentops.outcomes(security_domain_id);
create index allocations_task_id_idx on agentops.allocations(task_id);
create index allocations_run_id_idx on agentops.allocations(run_id);
create index allocations_security_domain_id_idx on agentops.allocations(security_domain_id);
create index external_mappings_security_domain_id_idx on agentops.external_mappings(security_domain_id);
create index external_mappings_entity_idx on agentops.external_mappings(entity_type, entity_id);
create index events_security_domain_id_idx on agentops_audit.events(security_domain_id);
create index events_task_id_idx on agentops_audit.events(task_id);
create index events_run_id_idx on agentops_audit.events(run_id);
create index events_entity_idx on agentops_audit.events(entity_type, entity_id, occurred_at);
create index events_type_ingested_idx on agentops_audit.events(event_type, ingested_at);
create index outbox_event_row_id_idx on agentops_audit.outbox_items(event_row_id);
create index outbox_pending_idx on agentops_audit.outbox_items(available_at, id) where state = 'pending';
create index outbox_processing_lock_idx on agentops_audit.outbox_items(locked_at, id) where state = 'processing';

create or replace function agentops_private.payload_contains_secret(p_value jsonb)
returns boolean language plpgsql immutable strict set search_path = ''
as $$
declare
  v_key text;
  v_child jsonb;
  v_text text;
begin
  case jsonb_typeof(p_value)
    when 'object' then
      for v_key, v_child in select key, value from jsonb_each(p_value)
      loop
        if lower(v_key) ~ '^(password|passphrase|token|api[_-]?key|secret|private[_-]?key|service[_-]?role[_-]?key)$'
          and not (jsonb_typeof(v_child) = 'string' and (v_child #>> '{}') like 'secret://%')
        then
          return true;
        end if;
        if agentops_private.payload_contains_secret(v_child) then return true; end if;
      end loop;
    when 'array' then
      for v_child in select value from jsonb_array_elements(p_value)
      loop
        if agentops_private.payload_contains_secret(v_child) then return true; end if;
      end loop;
    when 'string' then
      v_text := p_value #>> '{}';
      return v_text ~* '(xox[baprs]-|xapp-|ghp_|github_pat_|sb_secret_|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)';
    else
      return false;
  end case;
  return false;
end;
$$;

create or replace function agentops_private.reject_secret_payload()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_payload jsonb;
begin
  if tg_table_schema = 'agentops_audit' and tg_table_name = 'events' then v_payload := new.payload;
  elsif tg_table_schema = 'agentops_audit' and tg_table_name = 'outbox_items' then v_payload := new.payload;
  elsif tg_table_schema = 'agentops' and tg_table_name = 'jobs' then v_payload := new.envelope;
  elsif tg_table_schema = 'agentops' and tg_table_name = 'policy_decisions' then v_payload := new.input;
  elsif tg_table_schema = 'agentops' and tg_table_name = 'attention_items' then v_payload := coalesce(new.durable_response, '{}'::jsonb);
  elsif tg_table_schema = 'agentops' and tg_table_name = 'external_mappings' then v_payload := new.synchronization_metadata;
  else raise exception 'secret payload guard is not configured for %.%', tg_table_schema, tg_table_name;
  end if;

  if agentops_private.payload_contains_secret(v_payload) then
    raise exception using errcode = '22023', message = 'inline secret-like data is forbidden; store an approved secret reference';
  end if;
  return new;
end;
$$;

create trigger jobs_secret_guard before insert or update of envelope on agentops.jobs
for each row execute function agentops_private.reject_secret_payload();
create trigger policy_decisions_secret_guard before insert or update of input on agentops.policy_decisions
for each row execute function agentops_private.reject_secret_payload();
create trigger attention_items_secret_guard before insert or update of durable_response on agentops.attention_items
for each row execute function agentops_private.reject_secret_payload();
create trigger external_mappings_secret_guard before insert or update of synchronization_metadata on agentops.external_mappings
for each row execute function agentops_private.reject_secret_payload();
create trigger events_secret_guard before insert or update of payload on agentops_audit.events
for each row execute function agentops_private.reject_secret_payload();
create trigger outbox_secret_guard before insert or update of payload on agentops_audit.outbox_items
for each row execute function agentops_private.reject_secret_payload();

create or replace function agentops_private.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger principals_set_updated_at before update on agentops.principals for each row execute function agentops_private.set_updated_at();
create trigger projects_set_updated_at before update on agentops.projects for each row execute function agentops_private.set_updated_at();
create trigger providers_set_updated_at before update on agentops.providers for each row execute function agentops_private.set_updated_at();
create trigger workers_set_updated_at before update on agentops.workers for each row execute function agentops_private.set_updated_at();
create trigger tasks_set_updated_at before update on agentops.tasks for each row execute function agentops_private.set_updated_at();
create trigger runs_set_updated_at before update on agentops.runs for each row execute function agentops_private.set_updated_at();
create trigger sessions_set_updated_at before update on agentops.sessions for each row execute function agentops_private.set_updated_at();
create trigger jobs_set_updated_at before update on agentops.jobs for each row execute function agentops_private.set_updated_at();
create trigger skill_installations_set_updated_at before update on agentops.skill_installations for each row execute function agentops_private.set_updated_at();
create trigger attention_items_set_updated_at before update on agentops.attention_items for each row execute function agentops_private.set_updated_at();
create trigger external_mappings_set_updated_at before update on agentops.external_mappings for each row execute function agentops_private.set_updated_at();

create or replace function agentops_private.reject_event_mutation()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'audit events are append-only';
end;
$$;

create trigger events_append_only before update or delete on agentops_audit.events
for each row execute function agentops_private.reject_event_mutation();

create or replace function agentops_private.enqueue_event_outbox()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into agentops_audit.outbox_items (event_row_id, destination, payload)
  values (
    new.id,
    'internal-event-projector',
    jsonb_build_object('eventId', new.event_id, 'eventType', new.event_type, 'entityType', new.entity_type, 'entityId', new.entity_id)
  );
  return new;
end;
$$;

create trigger events_enqueue_outbox after insert on agentops_audit.events
for each row execute function agentops_private.enqueue_event_outbox();

create or replace function agentops_private.current_principal_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select p.id
  from agentops.principals p
  where p.auth_user_id = (select auth.uid()) and p.active
  limit 1
$$;

revoke all on function agentops_private.payload_contains_secret(jsonb) from public, anon, authenticated;
revoke all on function agentops_private.reject_secret_payload() from public, anon, authenticated;
revoke all on function agentops_private.set_updated_at() from public, anon, authenticated;
revoke all on function agentops_private.reject_event_mutation() from public, anon, authenticated;
revoke all on function agentops_private.enqueue_event_outbox() from public, anon, authenticated;
revoke all on function agentops_private.current_principal_id() from public, anon;
grant execute on function agentops_private.current_principal_id() to authenticated;

create or replace function agentops.record_worker_event(
  p_version text,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_source_event_id text,
  p_occurred_at timestamptz,
  p_security_domain_id text,
  p_task_id uuid,
  p_run_id uuid,
  p_payload jsonb
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_principal agentops.principals%rowtype;
  v_worker agentops.workers%rowtype;
  v_job agentops.jobs%rowtype;
  v_event agentops_audit.events%rowtype;
begin
  select * into v_principal
  from agentops.principals p
  where p.auth_user_id = (select auth.uid()) and p.kind = 'worker' and p.active;

  if not found then raise exception using errcode = '42501', message = 'active worker principal required'; end if;
  if v_principal.security_domain_id <> p_security_domain_id then
    raise exception using errcode = '42501', message = 'security-domain mismatch';
  end if;
  select * into v_worker
  from agentops.workers w
  where w.principal_id = v_principal.id
    and w.security_domain_id = p_security_domain_id;
  if not found then
    raise exception using errcode = '42501', message = 'active worker registration required';
  end if;

  if p_task_id is null and p_run_id is null then
    if p_entity_type <> 'worker' or p_entity_id <> v_worker.id then
      raise exception using errcode = '42501', message = 'worker health events must identify the calling worker';
    end if;
  elsif p_task_id is null or p_run_id is null then
    raise exception using errcode = '42501', message = 'task and run lineage must be supplied together';
  else
    select j.* into v_job
    from agentops.jobs j
    where j.worker_id = v_worker.id
      and j.task_id = p_task_id
      and j.run_id = p_run_id
      and j.security_domain_id = p_security_domain_id
      and (
        (p_entity_type = 'worker' and p_entity_id = v_worker.id)
        or (p_entity_type = 'job' and p_entity_id = j.id)
        or (p_entity_type = 'task' and p_entity_id = j.task_id)
        or (p_entity_type = 'run' and p_entity_id = j.run_id)
        or (
          p_entity_type = 'session'
          and exists (
            select 1
            from agentops.sessions s
            where s.id = p_entity_id
              and s.run_id = j.run_id
              and s.provider_id = j.provider_id
              and s.security_domain_id = p_security_domain_id
          )
        )
      )
    order by j.created_at desc
    limit 1;

    if not found then
      raise exception using errcode = '42501', message = 'event lineage is not assigned to the calling worker';
    end if;
  end if;
  if p_occurred_at > clock_timestamp() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'event occurrence time is implausibly far in the future';
  end if;

  insert into agentops_audit.events (
    version, event_type, entity_type, entity_id, security_domain_id, task_id, run_id,
    source_kind, source_id, source_event_id, occurred_at, payload
  )
  values (
    p_version, p_event_type, p_entity_type, p_entity_id, p_security_domain_id, p_task_id, p_run_id,
    'worker', v_principal.id::text, p_source_event_id, p_occurred_at, p_payload
  )
  on conflict (source_kind, source_id, source_event_id) do nothing
  returning * into v_event;

  if found then return v_event.event_id; end if;

  select * into strict v_event
  from agentops_audit.events e
  where e.source_kind = 'worker'
    and e.source_id = v_principal.id::text
    and e.source_event_id = p_source_event_id;

  if v_event.version is distinct from p_version
    or v_event.event_type is distinct from p_event_type
    or v_event.entity_type is distinct from p_entity_type
    or v_event.entity_id is distinct from p_entity_id
    or v_event.security_domain_id is distinct from p_security_domain_id
    or v_event.task_id is distinct from p_task_id
    or v_event.run_id is distinct from p_run_id
    or v_event.occurred_at is distinct from p_occurred_at
    or v_event.payload is distinct from p_payload
  then
    raise exception using errcode = '23505', message = 'source event identity was reused with different content';
  end if;
  return v_event.event_id;
end;
$$;

revoke all on function agentops.record_worker_event(text, text, text, uuid, text, timestamptz, text, uuid, uuid, jsonb) from public, anon;
grant execute on function agentops.record_worker_event(text, text, text, uuid, text, timestamptz, text, uuid, uuid, jsonb) to authenticated;

create or replace function agentops.acquire_coordinator_lease(
  p_lease_name text,
  p_holder_principal_id uuid,
  p_ttl_seconds integer
)
returns table (
  acquired boolean,
  lease_name text,
  holder_principal_id uuid,
  fencing_token bigint,
  expires_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_ttl_seconds < 5 or p_ttl_seconds > 300 then
    raise exception using errcode = '22023', message = 'coordinator lease TTL must be between 5 and 300 seconds';
  end if;
  if not exists (
    select 1 from agentops.principals p
    where p.id = p_holder_principal_id and p.kind = 'coordinator' and p.active
  ) then
    raise exception using errcode = '42501', message = 'active coordinator principal required';
  end if;

  return query
  insert into agentops.coordinator_leases as current_lease (
    lease_name, holder_principal_id, fencing_token, acquired_at, expires_at, updated_at
  )
  values (
    p_lease_name, p_holder_principal_id, 1, v_now,
    v_now + make_interval(secs => p_ttl_seconds), v_now
  )
  on conflict on constraint coordinator_leases_pkey do update
  set holder_principal_id = excluded.holder_principal_id,
      fencing_token = case when current_lease.expires_at <= v_now then current_lease.fencing_token + 1 else current_lease.fencing_token end,
      acquired_at = case when current_lease.expires_at <= v_now then v_now else current_lease.acquired_at end,
      expires_at = v_now + make_interval(secs => p_ttl_seconds),
      updated_at = v_now
  where current_lease.expires_at <= v_now or current_lease.holder_principal_id = excluded.holder_principal_id
  returning true, current_lease.lease_name, current_lease.holder_principal_id, current_lease.fencing_token, current_lease.expires_at;

  if found then return; end if;

  return query
  select false, current_lease.lease_name, current_lease.holder_principal_id,
    current_lease.fencing_token, current_lease.expires_at
  from agentops.coordinator_leases current_lease
  where current_lease.lease_name = p_lease_name;
end;
$$;

create or replace function agentops.validate_fencing_token(
  p_lease_name text,
  p_holder_principal_id uuid,
  p_fencing_token bigint
)
returns boolean language sql volatile security definer set search_path = ''
as $$
  select exists (
    select 1 from agentops.coordinator_leases l
    where l.lease_name = p_lease_name
      and l.holder_principal_id = p_holder_principal_id
      and l.fencing_token = p_fencing_token
      and l.expires_at > clock_timestamp()
  )
$$;

create or replace function agentops.create_job(
  p_job_id uuid,
  p_task_id uuid,
  p_run_id uuid,
  p_worker_id uuid,
  p_provider_id uuid,
  p_security_domain_id text,
  p_policy_decision_id uuid,
  p_coordinator_principal_id uuid,
  p_coordinator_lease_name text,
  p_fencing_token bigint,
  p_idempotency_key text,
  p_envelope_version text,
  p_envelope jsonb,
  p_signature_key_ref text,
  p_signature text,
  p_lease_expires_at timestamptz
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_job agentops.jobs%rowtype;
  v_coordinator_lease agentops.coordinator_leases%rowtype;
begin
  select * into v_coordinator_lease
  from agentops.coordinator_leases l
  where l.lease_name = p_coordinator_lease_name
  for update;

  if not found
    or v_coordinator_lease.holder_principal_id <> p_coordinator_principal_id
    or v_coordinator_lease.fencing_token <> p_fencing_token
    or v_coordinator_lease.expires_at <= clock_timestamp()
  then
    raise exception using errcode = '40001', message = 'stale or expired coordinator fencing token';
  end if;
  if p_lease_expires_at <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'worker lease must expire in the future';
  end if;
  if not exists (
    select 1 from agentops.policy_decisions d
    where d.id = p_policy_decision_id and d.task_id = p_task_id and d.run_id = p_run_id
      and d.security_domain_id = p_security_domain_id and d.decision = 'allow'
  ) then
    raise exception using errcode = '42501', message = 'an applicable allow policy decision is required before dispatch';
  end if;
  if not exists (
    select 1
    from agentops.runs r
    join agentops.tasks t on t.id = r.task_id
    join agentops.workers w on w.id = p_worker_id
    join agentops.providers p on p.id = p_provider_id
    where r.id = p_run_id and r.task_id = p_task_id
      and r.security_domain_id = p_security_domain_id
      and t.security_domain_id = p_security_domain_id
      and w.security_domain_id = p_security_domain_id
      and p.security_domain_id = p_security_domain_id
  ) then
    raise exception using errcode = '42501', message = 'task, run, worker, and provider security domains must match';
  end if;

  insert into agentops.jobs (
    id, task_id, run_id, worker_id, provider_id, security_domain_id, policy_decision_id,
    coordinator_principal_id, coordinator_lease_name, fencing_token, idempotency_key,
    envelope_version, envelope, signature_key_ref, signature, lease_expires_at
  )
  values (
    p_job_id, p_task_id, p_run_id, p_worker_id, p_provider_id, p_security_domain_id, p_policy_decision_id,
    p_coordinator_principal_id, p_coordinator_lease_name, p_fencing_token, p_idempotency_key,
    p_envelope_version, p_envelope, p_signature_key_ref, p_signature, p_lease_expires_at
  )
  on conflict (run_id, idempotency_key) do nothing
  returning * into v_job;

  if not found then
    select * into strict v_job from agentops.jobs j
    where j.run_id = p_run_id and j.idempotency_key = p_idempotency_key;
    if v_job.id is distinct from p_job_id
      or v_job.task_id is distinct from p_task_id
      or v_job.run_id is distinct from p_run_id
      or v_job.worker_id is distinct from p_worker_id
      or v_job.provider_id is distinct from p_provider_id
      or v_job.security_domain_id is distinct from p_security_domain_id
      or v_job.policy_decision_id is distinct from p_policy_decision_id
      or v_job.coordinator_principal_id is distinct from p_coordinator_principal_id
      or v_job.coordinator_lease_name is distinct from p_coordinator_lease_name
      or v_job.fencing_token is distinct from p_fencing_token
      or v_job.idempotency_key is distinct from p_idempotency_key
      or v_job.envelope_version is distinct from p_envelope_version
      or v_job.envelope is distinct from p_envelope
      or v_job.signature_key_ref is distinct from p_signature_key_ref
      or v_job.signature is distinct from p_signature
      or v_job.lease_expires_at is distinct from p_lease_expires_at
    then
      raise exception using errcode = '23505', message = 'job idempotency key was reused with different content';
    end if;
    return v_job.id;
  end if;

  insert into agentops_audit.events (
    version, event_type, entity_type, entity_id, security_domain_id, task_id, run_id,
    source_kind, source_id, source_event_id, occurred_at, payload
  )
  values (
    '1.0', 'job.queued', 'job', v_job.id, v_job.security_domain_id, v_job.task_id, v_job.run_id,
    'coordinator', v_job.coordinator_principal_id::text, 'job/' || v_job.id::text || '/queued',
    clock_timestamp(),
    jsonb_build_object('jobId', v_job.id, 'workerId', v_job.worker_id, 'providerId', v_job.provider_id, 'fencingToken', v_job.fencing_token)
  );
  return v_job.id;
end;
$$;

create or replace function agentops.claim_outbox_items(
  p_lock_owner text,
  p_limit integer,
  p_max_attempts integer default 10
)
returns setof agentops_audit.outbox_items
language plpgsql security definer set search_path = ''
as $$
begin
  if p_lock_owner is null or length(trim(p_lock_owner)) < 1 or length(p_lock_owner) > 200 then
    raise exception using errcode = '22023', message = 'lock owner must contain between 1 and 200 characters';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'claim limit must be between 1 and 100';
  end if;
  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 100 then
    raise exception using errcode = '22023', message = 'max attempts must be between 1 and 100';
  end if;

  update agentops_audit.outbox_items o
  set state = 'dead-letter',
      locked_by = null,
      locked_at = null,
      last_error_code = 'DELIVERY_TIMEOUT'
  where o.state = 'processing'
    and o.locked_at <= clock_timestamp() - interval '5 minutes'
    and o.attempts >= p_max_attempts;

  return query
  update agentops_audit.outbox_items o
  set state = 'processing',
      locked_by = p_lock_owner,
      locked_at = clock_timestamp(),
      attempts = o.attempts + 1
  where o.id in (
    select candidate.id
    from agentops_audit.outbox_items candidate
    where (
        candidate.state = 'pending'
        and candidate.available_at <= clock_timestamp()
      )
      or (
        candidate.state = 'processing'
        and candidate.locked_at <= clock_timestamp() - interval '5 minutes'
        and candidate.attempts < p_max_attempts
      )
    order by candidate.available_at, candidate.id
    limit p_limit
    for update skip locked
  )
  returning o.*;
end;
$$;

create or replace function agentops.complete_outbox_item(
  p_item_id bigint,
  p_lock_owner text,
  p_succeeded boolean,
  p_error_code text,
  p_max_attempts integer
)
returns agentops_audit.outbox_items
language plpgsql security definer set search_path = ''
as $$
declare
  v_item agentops_audit.outbox_items%rowtype;
begin
  if p_max_attempts < 1 or p_max_attempts > 100 then
    raise exception using errcode = '22023', message = 'max attempts must be between 1 and 100';
  end if;
  update agentops_audit.outbox_items o
  set state = case when p_succeeded then 'delivered' when o.attempts >= p_max_attempts then 'dead-letter' else 'pending' end,
      available_at = case
        when p_succeeded or o.attempts >= p_max_attempts then o.available_at
        else clock_timestamp() + make_interval(secs => least(300, (2 ^ least(o.attempts, 8))::integer))
      end,
      locked_by = null,
      locked_at = null,
      last_error_code = case when p_succeeded then null else p_error_code end,
      delivered_at = case when p_succeeded then clock_timestamp() else null end
  where o.id = p_item_id and o.state = 'processing' and o.locked_by = p_lock_owner
  returning * into v_item;

  if not found then
    raise exception using errcode = '40001', message = 'outbox item is not owned by this delivery attempt';
  end if;
  return v_item;
end;
$$;

revoke all on function agentops.acquire_coordinator_lease(text, uuid, integer) from public, anon, authenticated;
revoke all on function agentops.validate_fencing_token(text, uuid, bigint) from public, anon, authenticated;
revoke all on function agentops.create_job(uuid, uuid, uuid, uuid, uuid, text, uuid, uuid, text, bigint, text, text, jsonb, text, text, timestamptz) from public, anon, authenticated;
revoke all on function agentops.claim_outbox_items(text, integer, integer) from public, anon, authenticated;
revoke all on function agentops.complete_outbox_item(bigint, text, boolean, text, integer) from public, anon, authenticated;
grant execute on function agentops.acquire_coordinator_lease(text, uuid, integer) to service_role;
grant execute on function agentops.validate_fencing_token(text, uuid, bigint) to service_role;
grant execute on function agentops.create_job(uuid, uuid, uuid, uuid, uuid, text, uuid, uuid, text, bigint, text, text, jsonb, text, text, timestamptz) to service_role;
grant execute on function agentops.claim_outbox_items(text, integer, integer) to service_role;
grant execute on function agentops.complete_outbox_item(bigint, text, boolean, text, integer) to service_role;

alter table agentops.security_domains enable row level security;
alter table agentops.security_domains force row level security;
alter table agentops.principals enable row level security;
alter table agentops.principals force row level security;
alter table agentops.projects enable row level security;
alter table agentops.projects force row level security;
alter table agentops.providers enable row level security;
alter table agentops.providers force row level security;
alter table agentops.workers enable row level security;
alter table agentops.workers force row level security;
alter table agentops.tasks enable row level security;
alter table agentops.tasks force row level security;
alter table agentops.runs enable row level security;
alter table agentops.runs force row level security;
alter table agentops.policy_decisions enable row level security;
alter table agentops.policy_decisions force row level security;
alter table agentops.sessions enable row level security;
alter table agentops.sessions force row level security;
alter table agentops.coordinator_leases enable row level security;
alter table agentops.coordinator_leases force row level security;
alter table agentops.jobs enable row level security;
alter table agentops.jobs force row level security;
alter table agentops.skill_installations enable row level security;
alter table agentops.skill_installations force row level security;
alter table agentops.attention_items enable row level security;
alter table agentops.attention_items force row level security;
alter table agentops.artifacts enable row level security;
alter table agentops.artifacts force row level security;
alter table agentops.estimates enable row level security;
alter table agentops.estimates force row level security;
alter table agentops.outcomes enable row level security;
alter table agentops.outcomes force row level security;
alter table agentops.allocations enable row level security;
alter table agentops.allocations force row level security;
alter table agentops.external_mappings enable row level security;
alter table agentops.external_mappings force row level security;
alter table agentops_audit.events enable row level security;
alter table agentops_audit.events force row level security;
alter table agentops_audit.outbox_items enable row level security;
alter table agentops_audit.outbox_items force row level security;

create policy principals_select_self on agentops.principals
for select to authenticated
using (auth_user_id is not null and auth_user_id = (select auth.uid()) and active);

create policy workers_select_self on agentops.workers
for select to authenticated
using (principal_id = (select agentops_private.current_principal_id()));

create policy jobs_select_assigned on agentops.jobs
for select to authenticated
using (
  exists (
    select 1 from agentops.workers w
    where w.id = jobs.worker_id
      and w.principal_id = (select agentops_private.current_principal_id())
      and w.security_domain_id = jobs.security_domain_id
  )
);

grant select on agentops.principals, agentops.workers, agentops.jobs to authenticated;

grant select, insert, update on
  agentops.security_domains,
  agentops.principals,
  agentops.projects,
  agentops.providers,
  agentops.workers,
  agentops.tasks,
  agentops.runs,
  agentops.policy_decisions,
  agentops.sessions,
  agentops.coordinator_leases,
  agentops.jobs,
  agentops.skill_installations,
  agentops.attention_items,
  agentops.artifacts,
  agentops.estimates,
  agentops.outcomes,
  agentops.allocations,
  agentops.external_mappings
to service_role;

grant select, insert on agentops_audit.events to service_role;
grant select, insert, update on agentops_audit.outbox_items to service_role;
grant usage, select on all sequences in schema agentops_audit to service_role;

create view agentops.task_lineage
with (security_invoker = true)
as
select
  t.id as task_id,
  r.id as run_id,
  s.id as session_id,
  ai.id as attention_item_id,
  a.id as artifact_id,
  o.id as outcome_id,
  al.id as allocation_id
from agentops.tasks t
left join agentops.runs r on r.task_id = t.id
left join agentops.sessions s on s.run_id = r.id
left join agentops.attention_items ai on ai.task_id = t.id and ai.run_id is not distinct from r.id
left join agentops.artifacts a on a.task_id = t.id and a.run_id is not distinct from r.id
left join agentops.outcomes o on o.task_id = t.id and o.run_id is not distinct from r.id
left join agentops.allocations al on al.task_id = t.id and al.run_id is not distinct from r.id;

revoke all on agentops.task_lineage from public, anon, authenticated;
grant select on agentops.task_lineage to service_role;

alter default privileges in schema agentops revoke all on tables from public, anon, authenticated;
alter default privileges in schema agentops_audit revoke all on tables from public, anon, authenticated;
alter default privileges in schema agentops_private revoke all on functions from public, anon, authenticated;
