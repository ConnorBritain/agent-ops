begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, agentops, agentops_audit, agentops_private;

insert into agentops.security_domains (id, display_name)
values ('example-domain', 'Example domain');

insert into agentops.principals (id, auth_user_id, kind, security_domain_id, display_name)
values
  ('00000000-0000-4000-8000-000000000001', null, 'coordinator', 'example-domain', 'Coordinator'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000102', 'worker', 'example-domain', 'Worker one'),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000103', 'worker', 'example-domain', 'Worker two');

insert into agentops.projects (id, security_domain_id, name)
values ('00000000-0000-4000-8000-000000000010', 'example-domain', 'Example project');

insert into agentops.providers (id, security_domain_id, provider_key, state)
values ('00000000-0000-4000-8000-000000000020', 'example-domain', 'print-provider', 'available');

insert into agentops.workers (id, principal_id, security_domain_id, worker_key, state)
values
  ('00000000-0000-4000-8000-000000000030', '00000000-0000-4000-8000-000000000002', 'example-domain', 'worker-one', 'ready'),
  ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000003', 'example-domain', 'worker-two', 'ready');

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
  id, task_id, run_id, security_domain_id, action, decision, risk_level,
  recorded_by_principal_id, rationale
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
  'Bounded fixture.'
);

insert into agentops.coordinator_leases (
  lease_name, holder_principal_id, fencing_token, acquired_at, expires_at, updated_at
)
values (
  'primary-coordinator',
  '00000000-0000-4000-8000-000000000001',
  1,
  clock_timestamp(),
  clock_timestamp() + interval '5 minutes',
  clock_timestamp()
);

insert into agentops.jobs (
  id, task_id, run_id, worker_id, provider_id, security_domain_id, policy_decision_id,
  coordinator_principal_id, coordinator_lease_name, fencing_token, idempotency_key,
  envelope_version, envelope, signature_key_ref, signature, lease_expires_at
)
values
  (
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
    'job-worker-one',
    '1.0',
    '{"objective":"worker one"}'::jsonb,
    'secret://example/signing/coordinator',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    clock_timestamp() + interval '2 minutes'
  ),
  (
    '00000000-0000-4000-8000-000000000071',
    '00000000-0000-4000-8000-000000000040',
    '00000000-0000-4000-8000-000000000050',
    '00000000-0000-4000-8000-000000000031',
    '00000000-0000-4000-8000-000000000020',
    'example-domain',
    '00000000-0000-4000-8000-000000000060',
    '00000000-0000-4000-8000-000000000001',
    'primary-coordinator',
    1,
    'job-worker-two',
    '1.0',
    '{"objective":"worker two"}'::jsonb,
    'secret://example/signing/coordinator',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    clock_timestamp() + interval '2 minutes'
  );

insert into agentops.sessions (id, run_id, provider_id, security_domain_id, external_session_id)
values (
  '00000000-0000-4000-8000-000000000080',
  '00000000-0000-4000-8000-000000000050',
  '00000000-0000-4000-8000-000000000020',
  'example-domain',
  'session-example'
);

insert into agentops.attention_items (id, task_id, run_id, security_domain_id, type, summary)
values (
  '00000000-0000-4000-8000-000000000081',
  '00000000-0000-4000-8000-000000000040',
  '00000000-0000-4000-8000-000000000050',
  'example-domain',
  'review',
  'Review the bounded result.'
);

insert into agentops.artifacts (id, task_id, run_id, security_domain_id, kind, uri_ref)
values (
  '00000000-0000-4000-8000-000000000082',
  '00000000-0000-4000-8000-000000000040',
  '00000000-0000-4000-8000-000000000050',
  'example-domain',
  'report',
  'artifact://example/report'
);

insert into agentops.outcomes (id, task_id, run_id, security_domain_id, verdict, summary)
values (
  '00000000-0000-4000-8000-000000000083',
  '00000000-0000-4000-8000-000000000040',
  '00000000-0000-4000-8000-000000000050',
  'example-domain',
  'pass',
  'The fixture passed.'
);

insert into agentops.allocations (id, task_id, run_id, security_domain_id, category, quantity, unit)
values (
  '00000000-0000-4000-8000-000000000084',
  '00000000-0000-4000-8000-000000000040',
  '00000000-0000-4000-8000-000000000050',
  'example-domain',
  'compute',
  1,
  'test-unit'
);

select plan(4);

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000102';

select is((select count(*) from agentops.principals), 1::bigint, 'worker sees only its own principal');
select is((select count(*) from agentops.workers), 1::bigint, 'worker sees only its own worker record');
select is((select count(*) from agentops.jobs), 1::bigint, 'worker sees only its assigned job');

reset role;

select ok(
  exists (
    select 1
    from agentops.task_lineage
    where task_id = '00000000-0000-4000-8000-000000000040'
      and run_id = '00000000-0000-4000-8000-000000000050'
      and session_id = '00000000-0000-4000-8000-000000000080'
      and attention_item_id = '00000000-0000-4000-8000-000000000081'
      and artifact_id = '00000000-0000-4000-8000-000000000082'
      and outcome_id = '00000000-0000-4000-8000-000000000083'
      and allocation_id = '00000000-0000-4000-8000-000000000084'
  ),
  'task lineage traces through run, session, attention, artifact, outcome, and allocation'
);

select * from finish();
rollback;
