begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, agentops, agentops_audit, agentops_private;

insert into agentops.security_domains (id, display_name)
values ('example-domain', 'Example domain');

insert into agentops.principals (
  id,
  auth_user_id,
  kind,
  security_domain_id,
  display_name
)
values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101',
  'worker',
  'example-domain',
  'Example worker principal'
);

select plan(7);

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000101';

select lives_ok(
  $event$
    select agentops.record_worker_event(
      '1.0',
      'worker.health',
      'worker',
      '00000000-0000-4000-8000-000000000001',
      'health-0001',
      '2026-07-30T04:00:00Z',
      'example-domain',
      null,
      null,
      '{"state":"ready"}'::jsonb
    )
  $event$,
  'an authenticated worker records a normalized event'
);

select lives_ok(
  $event$
    select agentops.record_worker_event(
      '1.0',
      'worker.health',
      'worker',
      '00000000-0000-4000-8000-000000000001',
      'health-0001',
      '2026-07-30T04:00:00Z',
      'example-domain',
      null,
      null,
      '{"state":"ready"}'::jsonb
    )
  $event$,
  'an identical source event is idempotent'
);

select throws_ok(
  $event$
    select agentops.record_worker_event(
      '1.0',
      'worker.health',
      'worker',
      '00000000-0000-4000-8000-000000000001',
      'health-0001',
      '2026-07-30T04:00:00Z',
      'example-domain',
      null,
      null,
      '{"state":"busy"}'::jsonb
    )
  $event$,
  '23505',
  'source event identity was reused with different content',
  'a source identity cannot be reused with different content'
);

select throws_ok(
  $event$
    select agentops.record_worker_event(
      '1.0',
      'worker.health',
      'worker',
      '00000000-0000-4000-8000-000000000001',
      'health-0002',
      '2026-07-30T04:00:00Z',
      'example-domain',
      null,
      null,
      '{"token":"inline-value"}'::jsonb
    )
  $event$,
  '22023',
  'inline secret-like data is forbidden; store an approved secret reference',
  'inline secret-like event data is rejected'
);

reset role;

select is(
  (select count(*) from agentops_audit.events),
  1::bigint,
  'duplicate delivery creates one event'
);
select is(
  (select count(*) from agentops_audit.outbox_items),
  1::bigint,
  'event and outbox write transactionally once'
);
select throws_ok(
  $$update agentops_audit.events set event_type = 'worker.changed'$$,
  '55000',
  'audit events are append-only',
  'audit events cannot be mutated'
);

select * from finish();
rollback;
