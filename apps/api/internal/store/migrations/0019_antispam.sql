-- Request counts for the limits on public endpoints, shared by every API process. One row per
-- bucket, key and fixed window; key is a hash, so no typed email or address is kept. The tick
-- deletes rows whose window has ended.
create table rate_limits (
  bucket text not null,
  key text not null,
  window_start bigint not null,
  count int not null,
  expires_at timestamptz not null,
  primary key (bucket, key, window_start)
);
create index rate_limits_expires_idx on rate_limits (expires_at);

-- Cloudflare Turnstile keys for sign-up and shopper registration, set by a platform admin. One row
-- at most; without it no CAPTCHA is asked. The site key is public. The secret is AES-256-GCM
-- encrypted with CREDENTIALS_KEY, like the email key.
create table captcha_settings (
  id boolean primary key default true check (id),
  site_key text not null,
  ciphertext bytea not null,
  last4 text not null,
  updated_by text not null,
  updated_at timestamptz not null
);
