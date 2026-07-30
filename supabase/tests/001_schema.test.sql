begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, agentops, agentops_audit, agentops_private;

select plan(12);

select ok(to_regnamespace('agentops') is not null, 'agentops API schema exists');
select ok(to_regnamespace('agentops_audit') is not null, 'agentops audit schema exists');
select ok(to_regnamespace('agentops_private') is not null, 'agentops private schema exists');
select ok(to_regclass('agentops.tasks') is not null, 'tasks table exists');
select ok(to_regclass('agentops.runs') is not null, 'runs table exists');
select ok(to_regclass('agentops.sessions') is not null, 'sessions table exists');
select ok(to_regclass('agentops.jobs') is not null, 'jobs table exists');
select ok(to_regclass('agentops_audit.events') is not null, 'events table exists');
select ok(to_regclass('agentops_audit.outbox_items') is not null, 'outbox table exists');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'agentops.jobs'::regclass),
  'jobs table enables and forces RLS'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'agentops_audit.events'::regclass),
  'events table enables and forces RLS'
);
select ok(
  exists (
    select 1
    from pg_views
    where schemaname = 'agentops'
      and viewname = 'task_lineage'
      and definition like '%tasks%'
  ),
  'lineage view exists'
);

select * from finish();
rollback;
