-- Returns (RMA): one document per return, owned by the orders module. The console's state carries
-- only open returns; GET /views/returns pages through the rest, so the table can grow.
create table returns (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  code text generated always as (data->>'code') stored,
  status text generated always as (data->>'status') stored,
  order_id text generated always as (data->>'orderId') stored,
  customer_id text generated always as (data->>'customerId') stored,
  created_at text generated always as (data->>'createdAt') stored,
  updated_at timestamptz not null default now()
);
create index returns_tenant_idx on returns (tenant_id, created_at desc);
create index returns_order_idx on returns (order_id);
create index returns_customer_idx on returns (customer_id);
create unique index returns_code_idx on returns (tenant_id, code);

-- Shopper emails name the event they report, so a retried or repeated action queues one email only.
alter table email_outbox add column dedupe_key text;
create unique index email_outbox_dedupe_idx on email_outbox (dedupe_key) where dedupe_key is not null;
