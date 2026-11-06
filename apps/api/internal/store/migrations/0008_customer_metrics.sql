-- Read side of customer metrics (CQRS): order count, spend and recency per customer from sold
-- orders, the bought quantity per product, and the last abandoned checkout and purchase. Segment
-- rules, customer lists and the seller app read these rows instead of every order. A customer with
-- no sold order and no abandoned checkout has no row.
create table customer_metrics (
  customer_id text primary key,
  tenant_id text not null,
  orders int not null,
  spend bigint not null,
  first_at timestamptz,
  last_at timestamptz,
  product_counts jsonb not null,
  last_abandoned_at timestamptz,
  last_purchase_event_at timestamptz
);
create index customer_metrics_tenant_idx on customer_metrics (tenant_id);
