-- Links sent by email. Only the hash is stored, so a database leak hands out no working link.
create table email_tokens (
  hash text primary key,
  kind text not null,
  subject_type text not null,
  subject_id text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index email_tokens_subject_idx on email_tokens (subject_type, subject_id, kind);

alter table customer_credentials add column email_verified_at timestamptz;
