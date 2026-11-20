-- Storefront search: trigram matching on one folded text per product.
--
-- search_fold lower-cases, strips the accents of Latin letters and turns every run of other
-- characters into one space, so "Café-Latte" and "cafe latte" compare equal. The Go side
-- (service.foldSearch) applies the same rules to the query.
create extension if not exists pg_trgm;

create or replace function search_fold(t text) returns text
language sql immutable strict parallel safe as $$
  select btrim(regexp_replace(lower(translate(t,
    'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿÑñÇç',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOOooooooUUUUuuuuYyyNnCc')), '[^a-z0-9]+', ' ', 'g'))
$$;

-- What a shopper may type to find a product: its name, code, tags, "best for", every variant's SKU
-- and barcode, and its attribute values (brand, material, colour).
create or replace function product_search_text(d jsonb) returns text
language sql immutable strict parallel safe as $$
  select search_fold(concat_ws(' ',
    d->>'name', d->>'code', d->>'bestFor',
    (select string_agg(x, ' ') from jsonb_array_elements_text(
      case jsonb_typeof(d->'tags') when 'array' then d->'tags' else '[]'::jsonb end) x),
    (select string_agg(concat_ws(' ', v->>'sku', v->>'barcode'), ' ') from jsonb_array_elements(
      case jsonb_typeof(d->'variants') when 'array' then d->'variants' else '[]'::jsonb end) v),
    (select string_agg(a.value, ' ') from jsonb_each_text(
      case jsonb_typeof(d->'attributes') when 'object' then d->'attributes' else '{}'::jsonb end) a)))
$$;

-- The lowest price a shopper pays: the cheapest variant, else the product price.
create or replace function product_from_price(d jsonb) returns integer
language sql immutable strict parallel safe as $$
  select coalesce(
    (select min((v->>'price')::integer) from jsonb_array_elements(
      case jsonb_typeof(d->'variants') when 'array' then d->'variants' else '[]'::jsonb end) v
     where v->>'price' is not null),
    (d->>'price')::integer, 0)
$$;

-- Adding stored generated columns rewrites products under an exclusive lock, well under a second at
-- today's sizes (see 0031 for the larger-table procedure).
alter table products add column if not exists search_text text
  generated always as (product_search_text(data)) stored;
alter table products add column if not exists search_name text
  generated always as (search_fold(data->>'name')) stored;
alter table products add column if not exists category_id text
  generated always as (data->>'categoryId') stored;
alter table products add column if not exists from_price integer
  generated always as (product_from_price(data)) stored;
create index if not exists products_search_trgm_idx on products using gin (search_text gin_trgm_ops);
-- A query word that names a category finds the products in it.
create index if not exists products_category_idx on products (tenant_id, category_id);
