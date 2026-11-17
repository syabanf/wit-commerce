-- Custom domains. One brand holds a domain with and without www, so the column drops a leading www.
-- before comparing. The unique index covers domains claimed through PUT /tenants/{id}/domain, which
-- carry a verification token. A domain written at creation (the seed, tenants/create) has none: it is
-- never served or linked to until its brand connects it, and connecting it is refused while another
-- brand holds it.
alter table tenants
  add column domain text generated always as (nullif(regexp_replace(lower(data->>'domain'), '^www\.', ''), '')) stored;
create unique index tenants_domain_idx on tenants (domain) where data->>'domainToken' is not null;
