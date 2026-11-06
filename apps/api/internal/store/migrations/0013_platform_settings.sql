-- How the platform sends email, set by a platform admin in the console. One row at most: while it
-- exists it wins over RESEND_API_KEY and EMAIL_FROM. The API key is AES-256-GCM encrypted with
-- CREDENTIALS_KEY, like connector secrets; last4 is all of it the console shows. Each change also
-- goes to credential_events under the tenant id "platform".
create table email_settings (
  id boolean primary key default true check (id),
  provider text not null,
  ciphertext bytea not null,
  last4 text not null,
  from_address text not null,
  updated_by text not null,
  updated_at timestamptz not null
);
