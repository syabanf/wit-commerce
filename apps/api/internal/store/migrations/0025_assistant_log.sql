-- One row per question to the admin assistant. It keeps what the question cost and what happened to
-- each proposed action, never customer contact data: the question has emails and phone numbers
-- replaced before it is stored, and actions keep their type, target ids and risk only. The tick
-- deletes rows older than 90 days.
create table assistant_log (
  id text primary key,
  tenant_id text not null,
  user_id text not null,
  at timestamptz not null,
  page text not null default '',
  question text not null,
  model_calls int not null default 0,
  lookups text[] not null default '{}',
  answer_length int not null default 0,
  -- [{type, targets: [id], risk, outcome: null|confirmed|dismissed|failed}]
  actions jsonb not null default '[]',
  -- 1 for thumbs up, -1 for thumbs down.
  feedback smallint,
  latency_ms int not null default 0,
  error_code text
);
create index assistant_log_tenant_at_idx on assistant_log (tenant_id, at desc);
create index assistant_log_at_idx on assistant_log (at);
