package media

import (
	"context"
	"errors"
	"path"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
)

// Use is one place a brand shows an image.
type Use struct {
	// Kind is product, brand, page, page_draft, page_history, seller or order (a payment proof).
	Kind  string `json:"kind"`
	ID    string `json:"id"`
	Label string `json:"label"`
}

// UseFinder reports where a tenant uses each of the named files ("med-k3f9a1b2c3.png"). A file
// nothing uses has no entry.
type UseFinder interface {
	MediaUses(ctx context.Context, tenantID string, files []string) (map[string][]Use, error)
}

// MediaItem is an image in a brand's library with the places that show it.
type MediaItem struct {
	ID        string `json:"id"`
	URL       string `json:"url"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	Mime      string `json:"mime"`
	Size      int64  `json:"size"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
	Uses      []Use  `json:"uses"`
}

// MediaList is one page of a brand's library.
type MediaList struct {
	Items  []MediaItem `json:"items"`
	Total  int         `json:"total"`
	Limit  int         `json:"limit"`
	Offset int         `json:"offset"`
}

// InUse refuses a delete while the image still shows somewhere.
type InUse struct{ Uses []Use }

func (e InUse) Error() string { return "The image is in use. Replace it there first, then delete it." }

const (
	defaultPage = 48
	maxPage     = 100
	// keepUnused is how long an image nothing uses stays, so an upload survives until its form is saved.
	keepUnused = 24 * time.Hour
	sweepEvery = 24 * time.Hour
)

// List returns a brand's images, newest first; q filters by file name. Payment proofs shoppers
// uploaded stay out of the library: they belong to their orders.
func (m *Media) List(ctx context.Context, meta kernel.Meta, tenantID, q string, limit, offset int) (MediaList, error) {
	if err := kernel.Access(meta, tenantID); err != nil {
		return MediaList{}, err
	}
	if limit <= 0 {
		limit = defaultPage
	}
	out := MediaList{Items: []MediaItem{}, Limit: min(limit, maxPage), Offset: max(offset, 0)}
	like := "%" + strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(strings.TrimSpace(q)) + "%"
	if err := m.DB.Pool.QueryRow(ctx, `select count(*) from media where tenant_id = $1 and name ilike $2 and created_by <> 'storefront'`, tenantID, like).Scan(&out.Total); err != nil {
		return out, err
	}
	rows, err := m.DB.Pool.Query(ctx, `select id, path, width, height, mime, size, name, created_at from media
		where tenant_id = $1 and name ilike $2 and created_by <> 'storefront' order by created_at desc, id desc limit $3 offset $4`, tenantID, like, out.Limit, out.Offset)
	if err != nil {
		return out, err
	}
	var files []string
	out.Items, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (MediaItem, error) {
		var it MediaItem
		var key string
		var at time.Time
		err := row.Scan(&it.ID, &key, &it.Width, &it.Height, &it.Mime, &it.Size, &it.Name, &at)
		it.URL, it.CreatedAt, it.Uses = m.Storage.URL(key), at.UTC().Format(time.RFC3339), []Use{}
		files = append(files, path.Base(key))
		return it, err
	})
	if err != nil || len(files) == 0 {
		return out, err
	}
	uses, err := m.Uses.MediaUses(ctx, tenantID, files)
	if err != nil {
		return out, err
	}
	for i, file := range files {
		if u := uses[file]; u != nil {
			out.Items[i].Uses = u
		}
	}
	return out, nil
}

// Delete removes an image and its file, unless something still shows it.
func (m *Media) Delete(ctx context.Context, meta kernel.Meta, tenantID, id string) error {
	if err := kernel.Access(meta, tenantID); err != nil {
		return err
	}
	var key string
	err := m.DB.Pool.QueryRow(ctx, `select path from media where id = $1 and tenant_id = $2`, id, tenantID).Scan(&key)
	if errors.Is(err, pgx.ErrNoRows) {
		return kernel.NotFound{What: "image"}
	}
	if err != nil {
		return err
	}
	uses, err := m.Uses.MediaUses(ctx, tenantID, []string{path.Base(key)})
	if err != nil {
		return err
	}
	if u := uses[path.Base(key)]; len(u) > 0 {
		return InUse{Uses: u}
	}
	return m.remove(ctx, id, key)
}

// remove deletes the row and then the file; a file that will not go keeps its row.
func (m *Media) remove(ctx context.Context, id, key string) error {
	_, err := m.Run(ctx, func(t *kernel.Tx) error {
		if _, err := t.Exec(ctx, `delete from media where id = $1`, id); err != nil {
			return err
		}
		return m.Storage.Delete(ctx, key)
	})
	return err
}

// Sweep deletes the images older than a day that nothing uses: replaced logos and photos, and
// uploads whose form was never saved. It returns how many it removed.
func (m *Media) Sweep(ctx context.Context) (int, error) {
	rows, err := m.DB.Pool.Query(ctx, `select id, tenant_id, path from media
		where created_at < now() - make_interval(secs => $1) order by tenant_id, id`, keepUnused.Seconds())
	if err != nil {
		return 0, err
	}
	type old struct{ id, tenantID, key string }
	all, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (old, error) {
		var o old
		return o, row.Scan(&o.id, &o.tenantID, &o.key)
	})
	if err != nil {
		return 0, err
	}
	removed := 0
	for start := 0; start < len(all); {
		end := start
		var files []string
		for ; end < len(all) && all[end].tenantID == all[start].tenantID; end++ {
			files = append(files, path.Base(all[end].key))
		}
		uses, err := m.Uses.MediaUses(ctx, all[start].tenantID, files)
		if err != nil {
			return removed, err
		}
		for _, o := range all[start:end] {
			if len(uses[path.Base(o.key)]) > 0 {
				continue
			}
			if err := m.remove(ctx, o.id, o.key); err != nil {
				return removed, err
			}
			removed++
		}
		start = end
	}
	return removed, nil
}

// SweepIfDue runs Sweep once a day, and first when the process starts. The timer calls it every
// minute; a failure goes to the log and waits for the next day.
func (m *Media) SweepIfDue(ctx context.Context) {
	now := time.Now()
	m.mu.Lock()
	due := !now.Before(m.nextSweep)
	if due {
		m.nextSweep = now.Add(sweepEvery)
	}
	m.mu.Unlock()
	if !due {
		return
	}
	removed, err := m.Sweep(ctx)
	if err != nil {
		m.Log.Error("media sweep failed", "err", err, "removed", removed)
	} else if removed > 0 {
		m.Log.Info("media sweep", "removed", removed)
	}
}
