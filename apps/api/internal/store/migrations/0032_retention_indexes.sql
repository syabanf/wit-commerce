-- Indexes for the hourly retention job (service.Prune), so each bounded delete finds its old rows
-- without reading the whole table. request_log already has request_log_at_idx and needs nothing.
-- See 0031 for building these concurrently on a large production table.

-- Finished deliveries only: pending ones are never pruned and have webhook_deliveries_due_idx.
create index if not exists webhook_deliveries_done_idx on webhook_deliveries (created_at) where status <> 'pending';

-- Finished mail only: sent, or given up after the last attempt (notifications.MaxAttempts, 8).
create index if not exists email_outbox_done_idx on email_outbox (created_at) where sent_at is not null or attempts >= 8;

-- The document logs keep years, so these mostly answer "nothing to delete" at once.
create index if not exists stock_moves_at_idx on stock_moves (at);
create index if not exists integration_logs_at_idx on integration_logs (at);
create index if not exists traffic_day_idx on traffic (day);
