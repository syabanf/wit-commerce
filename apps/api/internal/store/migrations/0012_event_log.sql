-- Changes too large for one NOTIFY payload (under 8000 bytes). The API writes the change here and
-- notifies its id; a shop process reads it back. Each write prunes rows older than ten minutes.
create table event_log (
  id bigserial primary key,
  change json not null,
  created_at timestamptz not null default now()
);
create index event_log_created_idx on event_log (created_at);
