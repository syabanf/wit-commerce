-- Tokens issued before this moment no longer count: a password change or reset ends other sessions.
alter table credentials add column tokens_valid_from timestamptz not null default 'epoch';
alter table customer_credentials add column tokens_valid_from timestamptz not null default 'epoch';
