-- Multiplies the demo seed for load tests: every brand's orders, customers, customer events, order
-- rows and customer metrics get `copies` more copies. Copy n suffixes ids with xN, codes with XN and
-- prefixes emails with "N.", so the unique indexes hold and each copy points at its own customers.
-- Run it once on a freshly seeded database, with the API stopped (its caches would go stale):
--   psql "$DATABASE_URL" -v copies=4 -f perf/scale.sql
-- Rows of the original seed are the ones without an xN suffix, so running it twice adds nothing.
\set ON_ERROR_STOP on
\if :{?copies}
\else
  \set copies 4
\endif

begin;

create temp table copy_n on commit drop as select generate_series(1, :copies) as n;

insert into customers (id, data)
select c.id || 'x' || n,
  c.data || jsonb_build_object('id', c.id || 'x' || n, 'code', c.code || 'X' || n)
    || case when c.data->>'email' <> '' then jsonb_build_object('email', n || '.' || (c.data->>'email')) else '{}' end
from customers c, copy_n where c.id !~ 'x[0-9]+$'
on conflict do nothing;

insert into orders (id, data)
select o.id || 'x' || n,
  o.data || jsonb_build_object('id', o.id || 'x' || n, 'code', o.code || 'X' || n, 'customerId', o.customer_id || 'x' || n)
from orders o, copy_n where o.id !~ 'x[0-9]+$'
on conflict do nothing;

insert into customer_events (id, data)
select e.id || 'x' || n,
  e.data || jsonb_build_object('id', e.id || 'x' || n, 'customerId', e.customer_id || 'x' || n)
    || case when e.data->>'orderId' is not null then jsonb_build_object('orderId', (e.data->>'orderId') || 'x' || n) else '{}' end
from customer_events e, copy_n where e.id !~ 'x[0-9]+$'
on conflict do nothing;

insert into order_rows (id, tenant_id, code, customer_id, customer_name, customer_code, status, payment_status, channel,
  seller_id, created_at, total, item_count, agent, refunded_amount, search, campaign_id, payment_method, payment_type_id,
  subtotal, shipped_at, agent_info)
select r.id || 'x' || n, r.tenant_id, r.code || 'X' || n, r.customer_id || 'x' || n, r.customer_name, r.customer_code || 'X' || n,
  r.status, r.payment_status, r.channel, r.seller_id, r.created_at, r.total, r.item_count, r.agent, r.refunded_amount,
  lower(r.code || 'X' || n) || ' ' || r.search, r.campaign_id, r.payment_method, r.payment_type_id, r.subtotal, r.shipped_at, r.agent_info
from order_rows r, copy_n where r.id !~ 'x[0-9]+$'
on conflict do nothing;

insert into customer_metrics (customer_id, tenant_id, orders, spend, first_at, last_at, product_counts, last_abandoned_at,
  last_purchase_event_at, buy_months)
select m.customer_id || 'x' || n, m.tenant_id, m.orders, m.spend, m.first_at, m.last_at, m.product_counts, m.last_abandoned_at,
  m.last_purchase_event_at, m.buy_months
from customer_metrics m, copy_n where m.customer_id !~ 'x[0-9]+$'
on conflict do nothing;

commit;

analyze customers, orders, customer_events, order_rows, customer_metrics;

select tenant_id, count(*) as orders from orders group by 1 order by 1;
