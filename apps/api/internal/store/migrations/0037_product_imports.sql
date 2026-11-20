-- A product CSV import between its dry run and its last batch. The dry run stores the valid
-- products (groups, in file order) and the rows it refused (issues); each apply call takes the next
-- batch from next_index in one transaction and moves next_index on, so an import cut off midway
-- carries on from where it stopped. Pruned after 30 days.
create table product_imports (
  id text primary key,
  tenant_id text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  file_name text not null default '',
  status text not null default 'ready' check (status in ('ready', 'applying', 'done')),
  groups jsonb not null,
  total int not null,
  next_index int not null default 0,
  rows int not null default 0,
  plan jsonb not null default '{}',
  created int not null default 0,
  updated int not null default 0,
  unchanged int not null default 0,
  skipped int not null default 0,
  issues jsonb not null default '[]',
  finished_at timestamptz
);
create index product_imports_tenant_idx on product_imports (tenant_id, created_at desc);
create index product_imports_created_idx on product_imports (created_at);
