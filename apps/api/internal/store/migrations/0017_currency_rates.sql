-- Exchange rates for showing shoppers estimated prices in another currency. Stores still sell, charge
-- and report in rupiah. rate is units of the currency per 1 IDR. source is auto (the daily refresh
-- from Frankfurter writes it) or manual (a platform admin set it, and the refresh leaves it alone).
create table currency_rates (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  rate double precision not null check (rate > 0),
  source text not null check (source in ('auto', 'manual')),
  updated_at timestamptz not null,
  updated_by text not null
);
