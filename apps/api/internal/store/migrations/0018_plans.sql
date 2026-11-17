-- What a platform admin changed about a plan: its monthly price in rupiah and its limits. A plan
-- without a row uses the defaults compiled into the API (billing.Defaults).
create table plan_settings (
  plan text primary key check (plan in ('starter', 'growth', 'enterprise')),
  price bigint not null check (price >= 0),
  limits jsonb not null,
  updated_by text not null,
  updated_at timestamptz not null
);

-- A brand asking to move to another plan. A platform admin approves or declines it; approval
-- changes tenant.plan. A brand has at most one pending request.
create table plan_requests (
  id text primary key,
  tenant_id text not null,
  from_plan text not null,
  to_plan text not null,
  note text not null default '',
  status text not null check (status in ('pending', 'approved', 'declined')),
  requested_by text not null,
  requested_at timestamptz not null,
  decided_by text,
  decided_at timestamptz,
  decision_note text not null default ''
);
create unique index plan_requests_pending_idx on plan_requests (tenant_id) where status = 'pending';
create index plan_requests_tenant_idx on plan_requests (tenant_id, requested_at desc);

-- Billing records. Nothing here charges anyone: payment is arranged with the platform, and a
-- platform admin records the outcome. One invoice per tenant per month (period is YYYY-MM).
create table invoices (
  id text primary key,
  tenant_id text not null,
  period text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  plan text not null,
  amount bigint not null,
  status text not null check (status in ('due', 'paid', 'void')),
  issued_at timestamptz not null,
  paid_at timestamptz,
  updated_by text,
  unique (tenant_id, period)
);
