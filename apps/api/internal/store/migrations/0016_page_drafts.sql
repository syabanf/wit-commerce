-- Unpublished changes to a live page, one row per page (id is the page's id). Publishing copies
-- them into the page and deletes the row. Staff state carries them; the shop dataset does not.
create table page_drafts (
  id text primary key,
  tenant_id text not null generated always as (data->>'tenantId') stored,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index page_drafts_tenant_idx on page_drafts (tenant_id);
