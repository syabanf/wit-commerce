-- Online payments a provider collects for an order: one row per order. The order itself keeps only
-- its paymentStatus; this row holds what the provider said about the transaction.
create table payments (
  order_id text primary key,
  tenant_id text not null,
  provider text not null,
  -- The provider's own transaction id, known once the shopper picks a payment method.
  transaction_id text,
  -- The provider's transaction status, for example pending, settlement or expire.
  status text not null,
  snap_token text,
  redirect_url text,
  gross_amount bigint not null,
  -- The last notification body, as the provider sent it.
  last_notification jsonb,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_tenant_idx on payments (tenant_id);
