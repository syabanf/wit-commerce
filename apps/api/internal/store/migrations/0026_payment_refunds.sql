-- Refunds a payment gateway made for a return: one row per attempt, owned by the integrations
-- module. The refund key is sent to the gateway, so a retry of an attempt whose outcome is unknown
-- reuses it and the gateway refunds once. A definite failure starts the next attempt with a new key.
create table payment_refunds (
  refund_key text primary key,
  order_id text not null,
  tenant_id text not null,
  return_id text not null,
  attempt int not null,
  provider text not null,
  amount bigint not null,
  -- pending (asked, no answer yet), succeeded or failed.
  status text not null,
  gateway_ref text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (return_id, attempt)
);
create index payment_refunds_order_idx on payment_refunds (order_id);
