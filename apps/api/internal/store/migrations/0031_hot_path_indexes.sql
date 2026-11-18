-- Indexes for the filters that ran as sequential scans on request paths. Each generated column
-- repeats the exact expression the queries used before (data->>'...'), so switching a query from the
-- expression to the column changes no answer.
--
-- Migrations run inside a transaction, so these are plain create index statements: they block writes
-- to the table while they build, which takes well under a second at today's sizes. On a table with
-- millions of rows, build the index by hand first with create index concurrently (outside a
-- transaction), then let this migration run: if not exists makes it a no-op. Adding a stored
-- generated column rewrites the table under an exclusive lock either way; see apps/api/cmd/README.md.

-- Open orders: GET /state reads only these, and the tick scans the unpaid ones every minute.
create index if not exists orders_open_idx on orders (tenant_id, status)
  where status in ('new', 'confirmed', 'paid', 'processing', 'packed', 'shipped');

-- A sales user's assigned customers: every GET /state, event stream, segment count and order view.
alter table customers add column if not exists seller_id text generated always as (data->>'sellerId') stored;
create index if not exists customers_seller_idx on customers (seller_id);

-- A staff user's seller profiles: every request from a sales user resolves them first.
alter table sellers add column if not exists user_id text generated always as (data->>'userId') stored;
create index if not exists sellers_user_idx on sellers (user_id);

-- A customer's leads and tickets: guest merges and personal data requests (UU PDP).
alter table leads add column if not exists customer_id text generated always as (data->>'customerId') stored;
create index if not exists leads_customer_idx on leads (customer_id);
alter table tickets add column if not exists customer_id text generated always as (data->>'customerId') stored;
create index if not exists tickets_customer_idx on tickets (customer_id);
