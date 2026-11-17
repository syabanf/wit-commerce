-- Sales facts older than the console's daily window roll up into months, so long-range totals
-- survive while sales_days, product_days and seller_buyers stay bounded. The tick job rolls up once a
-- day; readmodel.Rebuild makes the same rows from the orders.
create table sales_months (
  id text primary key,
  tenant_id text not null,
  month text not null,
  channel text not null,
  seller_id text,
  campaign_id text,
  orders int not null,
  revenue bigint not null
);
create index sales_months_tenant_month_idx on sales_months (tenant_id, month);

create table product_months (
  id text primary key,
  tenant_id text not null,
  month text not null,
  product_id text not null,
  units int not null,
  revenue bigint not null,
  orders int not null
);
create index product_months_tenant_month_idx on product_months (tenant_id, month);

-- The day the roll-up last finished, one row.
create table sales_rollup (
  id int primary key default 1 check (id = 1),
  done_day text not null
);
