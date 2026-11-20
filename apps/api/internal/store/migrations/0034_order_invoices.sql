-- Invoices for orders, owned by the orders module. A number is issued the first time anyone opens
-- the order's invoice and never changes after: INV/{brand code}/{YYYY}/{MM}/{seq}, where seq runs
-- per brand and never resets, and YYYY/MM is the month of issue in WIB. The unique indexes make a
-- second issue for the same order or the same number fail instead of sharing it.
create table order_invoices (
  order_id text primary key,
  tenant_id text not null,
  seq int not null,
  number text not null,
  issued_at timestamptz not null,
  unique (tenant_id, seq),
  unique (tenant_id, number)
);
