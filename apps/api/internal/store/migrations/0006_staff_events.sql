-- Who changed which staff account. Rows are only ever added, and names are kept as they were at the
-- time. tenant_ids holds the person's brands before and after, to decide who may read the row.
create table staff_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id text not null,
  actor_name text not null,
  target_id text not null,
  target_name text not null,
  action text not null,
  detail text not null default '',
  tenant_ids text[] not null default '{}'
);
create index staff_events_tenants_idx on staff_events using gin (tenant_ids);
