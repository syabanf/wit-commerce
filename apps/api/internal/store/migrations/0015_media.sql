-- Images staff upload: logos, product photos and section images. The file lives in storage under
-- path; this row records who uploaded what, for which tenant.
create table media (
  id text primary key,
  tenant_id text not null,
  path text not null,
  mime text not null,
  size bigint not null,
  width int not null,
  height int not null,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index media_tenant_idx on media (tenant_id);
