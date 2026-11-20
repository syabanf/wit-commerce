package service

import (
	"context"
	"time"
)

// SitemapURL is one storefront path a search engine may index, with when its content last changed.
type SitemapURL struct {
	Path    string
	LastMod time.Time
}

// sitemapSQL lists a store's public pages in the storefront's own paths (apps/storefront
// src/lib/paths.ts): home, published store pages, categories, collections, active products and the
// personal pages of active sellers.
const sitemapSQL = `
select '/', max(updated_at) from pages
  where tenant_id = $1 and data->>'kind' = 'home' and status = 'published' and seller_id is null
union all
select * from (select data->>'slug', updated_at from pages
  where tenant_id = $1 and status = 'published' and seller_id is null and data->>'kind' <> 'home'
    and data->>'slug' ~ '^/[A-Za-z0-9._~-]+$' order by data->>'slug') p
union all
select * from (select '/c/' || id, updated_at from categories where tenant_id = $1 order by id) c
union all
select * from (select '/collections/' || (data->>'slug'), updated_at from collections
  where tenant_id = $1 and coalesce(data->>'slug', '') <> '' order by data->>'slug') k
union all
select * from (select '/p/' || id, updated_at from products where tenant_id = $1 and status = 'active' order by id) p
union all
select * from (select '/' || (s.data->>'slug'), greatest(s.updated_at, max(p.updated_at)) from sellers s
  join pages p on p.seller_id = s.id and p.data->>'kind' = 'personal' and p.status = 'published'
  where s.tenant_id = $1 and s.data->>'status' = 'active' and coalesce(s.data->>'slug', '') <> ''
  group by s.id, s.data, s.updated_at order by s.data->>'slug') s`

// SitemapURLs lists every public path of a store, home first.
func (s *Service) SitemapURLs(ctx context.Context, tenantID string) ([]SitemapURL, error) {
	rows, err := s.DB.Pool.Query(ctx, sitemapSQL, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SitemapURL{}
	for rows.Next() {
		var u SitemapURL
		var at *time.Time
		if err := rows.Scan(&u.Path, &at); err != nil {
			return nil, err
		}
		if at == nil {
			continue // No published home page: the max() over no rows.
		}
		u.LastMod = *at
		out = append(out, u)
	}
	return out, rows.Err()
}
