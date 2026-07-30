begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, agentops, agentops_audit, agentops_private;

insert into agentops.security_domains (id, display_name)
values ('example-domain', 'Example domain');

insert into agentops.principals (id, kind, security_domain_id, display_name)
values
  ('00000000-0000-4000-8000-000000000001', 'coordinator', 'example-domain', 'Coordinator one'),
  ('00000000-0000-4000-8000-000000000002', 'coordinator', 'example-domain', 'Coordinator two'),
  ('00000000-0000-4000-8000-000000000003', 'worker', 'example-domain', 'Worker');

insert into agentops.projects (id, security_domain_id, name)
values ('00000000-0000-4000-8000-000000000010', 'example-domain', 'Example project');

insert into agentops.providers (id, security_domain_id, provider_key, state)
values ('00000000-0000-4000-8000-000000000020', 'example-domain', 'print-provider', 'available');

insert into agentops.workers (id, principal_id, security_domain_id, worker_key, state, capabilities)
values (
  '00000000-0000-4000-8000-000000000030',
  '00000000-0000-4000-8000-000000000003',
  'example-domain',
  'worker-one',
  'ready',
  '["terminal"]'::jsonb
);

insert into agentops.tasks (id, project_id, security_domain_id, title, state, created_by_principal_id)
values (
  '00000000-0000-4000-8000-000000000040',
  '00000000-0000-4000-8000-000000000010',
  'example-domain',
  'Example task',
  'ready',
  '00000000-0000-4000-8000-000000000001'
);

insert into agentops.runs (id, task_id, security_domain_id)
values (
  '00000000-0000-4000-8000-000000000050',
  '00000000-0000-4000-8000-000000000040',
  'example-domain'
);

insert into agentops.policy_decisions (
  id,
  task_id,
  run_id,
  security_domain_id,
  action,
  decision,
  risk_level,
  recorded_by_principal_id,
  rationale
)
values (
  '00000000-0000-4000-8000-000000000060',
  '00000000-0000-4000-8000-000000000040',
  '00000000-0000-4000-8000-000000000050',
  'example-domain',
  'dispatch',
  'allow',
  'low',
  '00000000-0000-4000-8000-000000000001',
  'The bounded test dispatch is permitted.'
);

select plan(13);

create temp table first_lease as
select * from agentops.acquire_coordinator_lease(
  'primary-coordinator',
  '00000000-0000-4000-8000-000000000001',
  30
);

select ok((select acquired from first_lease), 'first Coordinator acquires lease');
select is((select fencing_token from first_lease), 1::bigint, 'first lease receives fencing token one');

create temp table renewal as
select * from agentops.acquire_coordinator_lease(
  'primary-coordinator',
  '00000000-0000-4000-8000-000000000001',
  30
);
select is((select fencing_token from renewal), 1::bigint, 'same live holder renews without changing token');

create temp table rejected_competitor as
select * from agentops.acquire_coordinator_lease(
  'primary-coordinator',
  '00000000-0000-4000-8000-000000000002',
  30
);
select ok(not (select acquired from rejected_competitor), 'a competitor cannot take a live lease');

update agentops.coordinator_leases
set acquired_at = clock_timestamp() - interval '2 minutes',
    expires_at = clock_timestamp() - interval '1 minute';

create temp table second_lease as
select * from agentops.acquire_coordinator_lease(
  'primary-coordinator',
  '00000000-0000-4000-8000-000000000002',
  30
);
select ok((select acquired from second_lease), 'competitor acquires only after expiry');
select is((select fencing_token from second_lease), 2::bigint, 'takeover increments fencing token');

select throws_ok(
  $job$
    select agentops.create_job(
      '00000000-0000-4000-8000-000000000070',
      '00000000-0000-4000-8000-000000000040',
      '00000000-0000-4000-8000-000000000050',
      '00000000-0000-4000-8000-000000000030',
      '00000000-0000-4000-8000-000000000020',
      'example-domain',
      '00000000-0000-4000-8000-000000000060',
      '00000000-0000-4000-8000-000000000001',
      'primary-coordinator',
      1,
      'job-attempt-0001',
      '1.0',
      '{"objective":"bounded test"}'::jsonb,
      'secret://example/signing/coordinator',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      clock_timestamp() + interval '2 minutes'
    )
  $job$,
  '40001',
  'stale or expired coordinator fencing token',
  'stale leader cannot create work'
);

select lives_ok(
  $job$
    select agentops.create_job(
      '00000000-0000-4000-8000-000000000071',
      '00000000-0000-4000-8000-000000000040',
      '00000000-0000-4000-8000-000000000050',
      '00000000-0000-4000-8000-000000000030',
      '00000000-0000-4000-8000-000000000020',
      'example-domain',
      '00000000-0000-4000-8000-000000000060',
      '00000000-0000-4000-8000-000000000002',
      'primary-coordinator',
      2,
      'job-attempt-0001',
      '1.0',
      '{"objective":"bounded test"}'::jsonb,
      'secret://example/signing/coordinator',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      clock_timestamp() + interval '2 minutes'
    )
  $job$,
  'current fenced leader creates work'
);

select is((select count(*) from agentops.jobs), 1::bigint, 'one job is created');
select is((select count(*) from agentops_audit.events where event_type = 'job.queued'), 1::bigint, 'job creation writes one audit event');
select is((select count(*) from agentops_audit.outbox_items), 1::bigint, 'job event creates one outbox item');

create temp table claimed_outbox as
select * from agentops.claim_outbox_items('delivery-test', 1);

select is((select count(*) from claimed_outbox), 1::bigint, 'outbox claim uses one bounded row');
select is((select state from claimed_outbox), 'processing', 'claimed outbox item is processing');

select lives_ok(
  $$select agentops.complete_outbox_item(id, 'delivery-test', false, 'DELIVERY_FAILED', 1) from claimed_outbox$$,
  'outbox failure is recorded'
);
select is(
  (select state from agentops_audit.outbox_items),
  'dead-letter',
  'retry exhaustion remains visibly dead-lettered'
);

select * from finish();
rollback;
