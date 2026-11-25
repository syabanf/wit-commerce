-- Extra email headers (List-Unsubscribe on marketing email), blanked with the body once sent.
alter table email_outbox add column headers jsonb not null default '{}'::jsonb;

-- Core retention (service/retention_core.go) finds rows past their PP 80/2019 period by these.
create index if not exists orders_created_idx on orders (created_at);
create index if not exists customers_created_idx on customers ((data->>'createdAt'));
create index if not exists tickets_created_idx on tickets ((data->>'createdAt'));
create index if not exists leads_created_idx on leads ((data->>'createdAt'));
create index if not exists invoices_issued_idx on invoices (issued_at);
create index if not exists privacy_requests_completed_idx on privacy_requests (completed_at) where status = 'completed';
