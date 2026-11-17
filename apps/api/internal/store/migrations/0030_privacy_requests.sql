-- Requests a shopper makes about their personal data (UU PDP Pasal 5 to 13): a copy of it, a
-- correction, its erasure, or the end of marketing consent. The brand answers within 3x24 hours
-- (Pasal 30, 32, 40 and 41), so due_at is requested_at plus 72 hours. Rows hold ids and notes, never
-- a copy of the contact details. An erasure blanks the customer's notes and keeps the rows as proof
-- it was done.
create table privacy_requests (
  id text primary key,
  tenant_id text not null,
  customer_id text not null,
  kind text not null check (kind in ('access', 'correction', 'erasure', 'withdraw_consent')),
  status text not null default 'open' check (status in ('open', 'completed')),
  requested_at timestamptz not null,
  due_at timestamptz not null,
  completed_at timestamptz,
  handled_by text,
  note text not null default ''
);
create index privacy_requests_tenant_idx on privacy_requests (tenant_id, status, due_at);
create index privacy_requests_customer_idx on privacy_requests (customer_id);
