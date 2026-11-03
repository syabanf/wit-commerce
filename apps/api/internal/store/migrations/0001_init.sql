-- Commerce OS schema. One table per entity in packages/types. Each row keeps the entity as one JSON
-- document (the aggregate its apps read and write whole), with generated columns for the fields the
-- API filters and indexes on. Nested value objects (variants, order lines, page sections) stay inside
-- the document because every reader needs them with their parent.

create table meta (
  key text primary key,
  value text not null
);

create table users (
  id text primary key,
  data jsonb not null,
  email text generated always as (lower(data->>'email')) stored,
  role text generated always as (data->>'role') stored,
  updated_at timestamptz not null default now()
);
create unique index users_email_idx on users (email);

create table credentials (
  user_id text primary key references users (id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table customer_credentials (
  customer_id text primary key,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table tenants (
  id text primary key,
  data jsonb not null,
  subdomain text generated always as (data->>'subdomain') stored,
  updated_at timestamptz not null default now()
);
create unique index tenants_subdomain_idx on tenants (subdomain);

create table templates (
  id text primary key,
  tenant_id text generated always as (data->>'tenantId') stored,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Tenant-owned entities share one shape: id, tenant_id, the document, and an updated_at for sync.
create table sellers (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  status text generated always as (data->>'status') stored,
  slug text generated always as (data->>'slug') stored,
  updated_at timestamptz not null default now()
);
create index sellers_tenant_idx on sellers (tenant_id);

create table pages (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  status text generated always as (data->>'status') stored,
  seller_id text generated always as (data->>'sellerId') stored,
  updated_at timestamptz not null default now()
);
create index pages_tenant_idx on pages (tenant_id);

create table categories (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index categories_tenant_idx on categories (tenant_id);

create table attributes (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index attributes_tenant_idx on attributes (tenant_id);

create table modifiers (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index modifiers_tenant_idx on modifiers (tenant_id);

create table collections (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index collections_tenant_idx on collections (tenant_id);

create table products (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  status text generated always as (data->>'status') stored,
  code text generated always as (data->>'code') stored,
  updated_at timestamptz not null default now()
);
create index products_tenant_idx on products (tenant_id, status);
create unique index products_code_idx on products (tenant_id, code);

create table warehouses (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index warehouses_tenant_idx on warehouses (tenant_id);

create table stock (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  variant_id text generated always as (data->>'variantId') stored,
  warehouse_id text generated always as (data->>'warehouseId') stored,
  updated_at timestamptz not null default now()
);
create index stock_tenant_idx on stock (tenant_id);
create unique index stock_variant_warehouse_idx on stock (variant_id, warehouse_id);

create table stock_moves (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  at text generated always as (data->>'at') stored,
  updated_at timestamptz not null default now()
);
create index stock_moves_tenant_idx on stock_moves (tenant_id, at desc);

create table modifier_stock (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  option_id text generated always as (data->>'optionId') stored,
  warehouse_id text generated always as (data->>'warehouseId') stored,
  updated_at timestamptz not null default now()
);
create index modifier_stock_tenant_idx on modifier_stock (tenant_id);
create unique index modifier_stock_option_warehouse_idx on modifier_stock (option_id, warehouse_id);

create table modifier_stock_moves (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  at text generated always as (data->>'at') stored,
  updated_at timestamptz not null default now()
);
create index modifier_stock_moves_tenant_idx on modifier_stock_moves (tenant_id, at desc);

create table customers (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  code text generated always as (data->>'code') stored,
  email text generated always as (lower(data->>'email')) stored,
  updated_at timestamptz not null default now()
);
create index customers_tenant_idx on customers (tenant_id);
create unique index customers_code_idx on customers (tenant_id, code);
create index customers_email_idx on customers (tenant_id, email);

create table customer_events (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  customer_id text generated always as (data->>'customerId') stored,
  at text generated always as (data->>'at') stored,
  updated_at timestamptz not null default now()
);
create index customer_events_tenant_idx on customer_events (tenant_id, at desc);
create index customer_events_customer_idx on customer_events (customer_id, at desc);

create table orders (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  code text generated always as (data->>'code') stored,
  status text generated always as (data->>'status') stored,
  customer_id text generated always as (data->>'customerId') stored,
  created_at text generated always as (data->>'createdAt') stored,
  updated_at timestamptz not null default now()
);
create index orders_tenant_idx on orders (tenant_id, created_at desc);
create index orders_customer_idx on orders (customer_id, created_at desc);
create unique index orders_code_idx on orders (tenant_id, code);

create table segments (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index segments_tenant_idx on segments (tenant_id);

create table leads (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  stage text generated always as (data->>'stage') stored,
  seller_id text generated always as (data->>'sellerId') stored,
  updated_at timestamptz not null default now()
);
create index leads_tenant_idx on leads (tenant_id);

create table tickets (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  status text generated always as (data->>'status') stored,
  updated_at timestamptz not null default now()
);
create index tickets_tenant_idx on tickets (tenant_id, status);

create table campaigns (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  status text generated always as (data->>'status') stored,
  updated_at timestamptz not null default now()
);
create index campaigns_tenant_idx on campaigns (tenant_id);

create table automations (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index automations_tenant_idx on automations (tenant_id);

create table promotions (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  status text generated always as (data->>'status') stored,
  code text generated always as (upper(data->>'code')) stored,
  updated_at timestamptz not null default now()
);
create index promotions_tenant_idx on promotions (tenant_id, status);

create table payment_types (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index payment_types_tenant_idx on payment_types (tenant_id);

-- One policy per tenant; the tenant id is the row id.
create table agent_policies (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table integrations (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index integrations_tenant_idx on integrations (tenant_id);

create table integration_logs (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  at text generated always as (data->>'at') stored,
  updated_at timestamptz not null default now()
);
create index integration_logs_tenant_idx on integration_logs (tenant_id, at desc);

create table traffic (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  day text generated always as (data->>'day') stored,
  updated_at timestamptz not null default now()
);
create index traffic_tenant_idx on traffic (tenant_id, day);

create table search_terms (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index search_terms_tenant_idx on search_terms (tenant_id);

-- Every inbound request, for the integration console and for debugging.
create table request_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  request_id text not null,
  method text not null,
  path text not null,
  status int not null,
  ms int not null,
  principal text,
  tenant_id text
);
create index request_log_at_idx on request_log (at desc);
