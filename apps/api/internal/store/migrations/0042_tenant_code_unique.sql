-- A brand's code prefixes its order, customer and invoice numbers, so two brands must never share
-- one. Sign-up takes an advisory lock per code base; this index is the last line behind it.
create unique index if not exists tenants_code_idx on tenants ((data->>'code'));
