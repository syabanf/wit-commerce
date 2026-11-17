package httpapi

import (
	"io"
	"log/slog"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// TestSharedLimiterFallsBackToMemory points a shared limiter at a database that does not answer: it
// still counts, in memory, and refuses past the limit.
func TestSharedLimiterFallsBackToMemory(t *testing.T) {
	pool, err := pgxpool.New(t.Context(), "postgres://nobody:nothing@127.0.0.1:1/none?connect_timeout=1")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	s := &Server{Options: Options{DB: &store.DB{Pool: pool}, Log: slog.New(slog.NewTextHandler(io.Discard, nil))}}
	s.subdomainChecks = newPeriodLimiter(2, time.Hour)
	s.shareLimits()
	for i, want := range []bool{true, true, false} {
		if got := s.subdomainChecks.allow("10.0.0.1", httptest.NewRecorder()); got != want {
			t.Errorf("request %d: allowed %v, want %v", i+1, got, want)
		}
	}
}
