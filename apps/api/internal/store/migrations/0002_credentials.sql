-- Connectivity credentials. API keys let outside systems call this API; only their SHA-256 is stored.
-- Connector secrets let this platform call providers; they are stored AES-256-GCM encrypted.

create table api_credentials (
  id text primary key,
  tenant_id text not null references tenants (id) on delete cascade,
  name text not null,
  prefix text not null,
  secret_hash text not null unique,
  scopes text[] not null,
  created_by text not null,
  created_at timestamptz not null,
  expires_at timestamptz,
  rotated_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz
);
create index api_credentials_tenant_idx on api_credentials (tenant_id, created_at desc);

create table connector_secrets (
  integration_id text not null references integrations (id) on delete cascade,
  field text not null,
  ciphertext bytea not null,
  last4 text not null,
  updated_by text not null,
  updated_at timestamptz not null,
  primary key (integration_id, field)
);

-- Who did what to a credential. Holds no secret material.
create table credential_events (
  id bigserial primary key,
  tenant_id text not null,
  subject text not null,
  action text not null,
  by text not null,
  at timestamptz not null
);
create index credential_events_tenant_idx on credential_events (tenant_id, id desc);
