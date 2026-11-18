package store

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestPoolFromEnv(t *testing.T) {
	env := func(m map[string]string) func(string) string { return func(k string) string { return m[k] } }
	cfg := &pgxpool.Config{}
	if err := poolFromEnv(cfg, env(nil)); err != nil {
		t.Fatal(err)
	}
	if cfg.MaxConns != 16 || cfg.MinConns != 0 || cfg.MaxConnLifetime != time.Hour || cfg.MaxConnIdleTime != 30*time.Minute {
		t.Fatalf("defaults: %+v", cfg)
	}
	if err := poolFromEnv(cfg, env(map[string]string{"DB_MAX_CONNS": "40", "DB_MIN_CONNS": "4", "DB_MAX_CONN_LIFETIME": "2h", "DB_MAX_CONN_IDLE_TIME": "5m"})); err != nil {
		t.Fatal(err)
	}
	if cfg.MaxConns != 40 || cfg.MinConns != 4 || cfg.MaxConnLifetime != 2*time.Hour || cfg.MaxConnIdleTime != 5*time.Minute {
		t.Fatalf("from env: %+v", cfg)
	}
	for _, bad := range []map[string]string{{"DB_MAX_CONNS": "many"}, {"DB_MAX_CONNS": "0"}, {"DB_MIN_CONNS": "20"}, {"DB_MAX_CONN_LIFETIME": "1 hour"}} {
		if err := poolFromEnv(&pgxpool.Config{}, env(bad)); err == nil {
			t.Errorf("%v: no error", bad)
		}
	}
}
