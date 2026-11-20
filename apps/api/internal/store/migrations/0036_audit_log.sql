-- Who changed what, for every write a staff member or an API key makes. kernel.Runtime.Run writes
-- one row per action in the action's own transaction, so a change and its record commit together.
-- Rows hold ids, field names and redacted before and after values, never password hashes, secrets,
-- emails, phone numbers or addresses. ip is truncated to its /24 (IPv4) or /48 (IPv6) network.
-- tenant_id is null for platform actions outside any brand.
create table audit_log (
  id bigint generated always as identity primary key,
  tenant_id text,
  at timestamptz not null default now(),
  actor_kind text not null check (actor_kind in ('user', 'api_key')),
  actor_id text not null,
  actor_name text not null default '',
  actor_role text not null default '',
  api_key_id text,
  action text not null,
  entity_collection text not null,
  entity_ids text[] not null default '{}',
  -- Every row the action touched, as collection:id, so an entity page finds its history.
  refs text[] not null default '{}',
  changes jsonb not null default '[]',
  request_id text not null default '',
  ip text not null default ''
);
create index audit_log_tenant_idx on audit_log (tenant_id, id desc);
create index audit_log_refs_idx on audit_log using gin (refs);
create index audit_log_at_idx on audit_log (at);

-- Append-only: no update ever, and a delete only from the retention prune, which sets
-- audit.prune for its own transaction. TRUNCATE (the test reset) fires no row trigger.
create function audit_log_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('audit.prune', true) = 'on' then
    return old;
  end if;
  raise exception 'audit_log is append-only';
end $$;
create trigger audit_log_append_only before update or delete on audit_log
  for each row execute function audit_log_guard();
