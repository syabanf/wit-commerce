-- Outbound webhooks. A delivery row is written in the same transaction as the change it reports, so
-- an event cannot be lost or sent for a change that rolled back.

create table webhook_endpoints (
  id text primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  url text not null,
  events text[] not null,
  secret_sealed bytea not null,
  enabled boolean not null default true,
  created_by text not null,
  created_at timestamptz not null
);
create index webhook_endpoints_tenant_idx on webhook_endpoints (tenant_id);

create table webhook_deliveries (
  id bigserial primary key,
  endpoint_id text not null references webhook_endpoints (id) on delete cascade,
  tenant_id text not null,
  event text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_status int,
  last_error text,
  created_at timestamptz not null,
  delivered_at timestamptz
);
create index webhook_deliveries_due_idx on webhook_deliveries (next_attempt_at) where status = 'pending';
create index webhook_deliveries_tenant_idx on webhook_deliveries (tenant_id, id desc);
