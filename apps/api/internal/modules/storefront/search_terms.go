package storefront

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"regexp"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

const (
	// searchTermsKept caps the terms one store keeps, so typed noise cannot grow the console's state
	// without end. Terms already kept go on counting.
	searchTermsKept = 5000
	// searchTermMaxLen is the longest term kept, in bytes of the folded query.
	searchTermMaxLen = 60
	searchWindowDays = 30
)

// personalTerm spots a query that looks like an email address or a phone number. Those are not
// kept: a search term is a count about the catalogue, never a record about a person (UU PDP).
var personalTerm = regexp.MustCompile(`@|\d{7,}|(\d[\s-]?){9,}`)

// SearchTermID names a store's row for one folded term, so the same words always count together.
func SearchTermID(tenantID, term string) string {
	sum := sha256.Sum256([]byte(tenantID + "\x00" + term))
	return "srch-" + hex.EncodeToString(sum[:8])
}

// LogSearch counts one storefront search of a folded term and keeps how many products it found.
// Counts live per WIB day for the last 30 days; Count30d is their sum. It writes nothing, and
// answers a nil delta, for an empty or personal-looking term or a store at its term cap.
func (s *Storefront) LogSearch(ctx context.Context, tenantID, term, raw string, results int) (*kernel.Delta, error) {
	if term == "" || len(term) > searchTermMaxLen || personalTerm.MatchString(raw) {
		return nil, nil
	}
	now := s.Clock.Now().In(clock.WIB)
	today := now.Format(time.DateOnly)
	oldest := now.AddDate(0, 0, -(searchWindowDays - 1)).Format(time.DateOnly)
	id := SearchTermID(tenantID, term)
	d, err := s.Run(ctx, func(t *kernel.Tx) error {
		st, err := store.Lock[domain.SearchTerm](t.Ctx, t.Tx, "searchTerms", id)
		switch {
		case errors.Is(err, store.ErrNotFound):
			var kept int
			if err := t.QueryRow(t.Ctx, `select count(*) from search_terms where tenant_id = $1`, tenantID).Scan(&kept); err != nil {
				return err
			}
			if kept >= searchTermsKept {
				return nil
			}
			st = domain.SearchTerm{ID: id, TenantID: tenantID, Term: term}
		case err != nil:
			return err
		}
		if st.Days == nil {
			// A term from before the daily counts (the seed) carries its old total as today's.
			st.Days = map[string]int{}
			if st.Count30d > 0 {
				st.Days[today] = st.Count30d
			}
		}
		st.Days[today]++
		st.Count30d = 0
		for day, n := range st.Days {
			if day < oldest {
				delete(st.Days, day)
				continue
			}
			st.Count30d += n
		}
		st.Results = results
		st.LastSearchedAt = clock.Iso(now)
		return t.Put("searchTerms", id, st)
	})
	if err != nil || d.Empty() {
		return nil, err
	}
	return d, nil
}
