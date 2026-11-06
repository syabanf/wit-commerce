-- Read side of orders (CQRS): one flat row per order with what the list shows, filters and sorts
-- on. The write side keeps the documents in orders; readmodel refreshes these rows in the same
-- transaction as each change, so a list never shows a state that was never committed.
create table order_rows (
  id text primary key,
  tenant_id text not null,
  code text not null,
  customer_id text not null,
  customer_name text not null,
  customer_code text not null,
  status text not null,
  payment_status text not null,
  channel text not null,
  seller_id text,
  created_at timestamptz not null,
  total bigint not null,
  item_count int not null,
  agent boolean not null,
  refunded_amount bigint not null,
  search text not null
);
create index order_rows_tenant_created_idx on order_rows (tenant_id, created_at desc);
create index order_rows_tenant_status_idx on order_rows (tenant_id, status);
create index order_rows_customer_idx on order_rows (customer_id);
