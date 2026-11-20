-- Gateway refunds now also return the money of a cancelled paid order, not only of a return.
-- kind tells them apart; for a cancellation, return_id holds "cancel-" and the order id, so the
-- refund keys and the unique (return_id, attempt) pair stay as they were.
alter table payment_refunds add column if not exists kind text not null default 'return';

-- GET /state carries cancelled orders whose refund is still owed, beside the open ones.
create index if not exists orders_refund_owed_idx on orders (tenant_id)
  where status = 'cancelled' and data->'cancelRefund'->>'status' in ('owed', 'pending', 'failed');
