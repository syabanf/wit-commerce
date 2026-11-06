-- Email waiting to go out. The request writes a row in the same transaction as the link it carries,
-- and a worker sends it later, so a crash or restart between the two loses no email.
--
-- A row stores the composed message and nothing else: no raw token in a column of its own. The body
-- holds the working link, because that link is what goes out. The trade-off: until a row is sent,
-- anyone who can read this table can use its link, as anyone who can read the inbox could. The
-- worker blanks html and text once a row is sent or given up, so the link lives here only while it
-- waits.
create table email_outbox (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  "to" text not null,
  subject text not null,
  html text not null,
  text text not null,
  kind text not null,
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text
);
create index email_outbox_pending_idx on email_outbox (next_attempt_at) where sent_at is null;
