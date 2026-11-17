-- Storefront complaints open tickets with sequential codes per brand (PP 80/2019 Pasal 27). The
-- unique index makes a second complaint that picked the same code at the same moment fail instead
-- of sharing it.
alter table tickets add column code text generated always as (data->>'code') stored;
create unique index tickets_code_idx on tickets (tenant_id, code);
