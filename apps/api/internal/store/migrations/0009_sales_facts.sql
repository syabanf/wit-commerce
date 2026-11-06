-- Read side of sales (CQRS): daily facts the console's analytics sum instead of reading every order.
-- Days are WIB calendar days. Ids match what packages/fixtures/src/facts.ts makes for the demo.
create table sales_days (
  id text primary key,
  tenant_id text not null,
  day text not null,
  channel text not null,
  seller_id text,
  campaign_id text,
  orders int not null,
  revenue bigint not null
);
create index sales_days_tenant_day_idx on sales_days (tenant_id, day);

create table product_days (
  id text primary key,
  tenant_id text not null,
  day text not null,
  product_id text not null,
  units int not null,
  revenue bigint not null,
  orders int not null
);
create index product_days_tenant_day_idx on product_days (tenant_id, day);

create table seller_buyers (
  id text primary key,
  tenant_id text not null,
  seller_id text not null,
  customer_id text not null,
  day text not null,
  orders int not null
);
create index seller_buyers_tenant_day_idx on seller_buyers (tenant_id, day);

alter table customer_metrics add column buy_months text[] not null default '{}';
