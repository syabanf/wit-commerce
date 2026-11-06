-- More of each order on its list row, so payment history, agent commerce and the dashboard read
-- order_rows instead of every order: how it was paid, when it shipped, its subtotal and the buying
-- agent's mandate summary.
alter table order_rows
  add column campaign_id text,
  add column payment_method text not null default '',
  add column payment_type_id text,
  add column subtotal bigint not null default 0,
  add column shipped_at timestamptz,
  add column agent_info jsonb;
create index order_rows_campaign_idx on order_rows (campaign_id);
create index order_rows_seller_idx on order_rows (seller_id);
create index order_rows_tenant_shipped_idx on order_rows (tenant_id, shipped_at);
