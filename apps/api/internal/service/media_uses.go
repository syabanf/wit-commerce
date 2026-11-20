package service

import (
	"context"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/modules/media"
)

// mediaUseRows lists, for one tenant, every row that names an uploaded image, with the text to
// search: products, the brand, pages (their sections, then their history), page drafts, seller
// photos and the payment proofs shoppers sent with orders. A page's history counts as a use, because a rollback would show the image again.
const mediaUseRows = `select kind, id, label, body from (
	select 0 as ord, 'product' as kind, id, data->>'name' as label, data::text as body from products where tenant_id = $1 and data::text like '%/med-%'
	union all
	select 1, 'brand', id, data->>'name', data::text from tenants where id = $1 and data::text like '%/med-%'
	union all
	select 2, 'page', id, data->>'title', (data->'sections')::text from pages where tenant_id = $1 and data::text like '%/med-%'
	union all
	select 3, 'page_draft', d.id, coalesce((select p.data->>'title' from pages p where p.id = d.id), ''), d.data::text
		from page_drafts d where d.tenant_id = $1 and d.data::text like '%/med-%'
	union all
	select 4, 'page_history', id, data->>'title', (data->'revisions')::text from pages where tenant_id = $1 and data::text like '%/med-%'
	union all
	select 5, 'seller', id, data->>'name', data->>'photoUrl' from sellers where tenant_id = $1 and data->>'photoUrl' like '%/med-%'
	union all
	select 6, 'order', id, data->>'code', data->'paymentConfirmation'->>'proofUrl' from orders
		where tenant_id = $1 and data->'paymentConfirmation'->>'proofUrl' like '%/med-%'
) uses order by ord, id`

// MediaUses implements media.UseFinder. It lives in the facade because the rows belong to
// identity, catalog and storefront.
func (s *Service) MediaUses(ctx context.Context, tenantID string, files []string) (map[string][]media.Use, error) {
	rows, err := s.DB.Pool.Query(ctx, mediaUseRows, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string][]media.Use{}
	onPage := map[string]bool{}
	for rows.Next() {
		var use media.Use
		var text string
		if err := rows.Scan(&use.Kind, &use.ID, &use.Label, &text); err != nil {
			return nil, err
		}
		for _, file := range files {
			if !strings.Contains(text, "/"+file) {
				continue
			}
			// A page that shows the image now is not listed again for its history.
			if use.Kind == "page" {
				onPage[file+" "+use.ID] = true
			} else if use.Kind == "page_history" && onPage[file+" "+use.ID] {
				continue
			}
			out[file] = append(out[file], use)
		}
	}
	return out, rows.Err()
}
