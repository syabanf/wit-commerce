package store

import (
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool defaults when the environment sets nothing. MaxConns 16 suits one API process on a small
// server; the others are pgx's own defaults, written out so the README can name them.
const (
	defaultMaxConns        = 16
	defaultMinConns        = 0
	defaultMaxConnLifetime = time.Hour
	defaultMaxConnIdleTime = 30 * time.Minute
)

// poolFromEnv sets the pool size and connection lifetimes from DB_MAX_CONNS, DB_MIN_CONNS,
// DB_MAX_CONN_LIFETIME and DB_MAX_CONN_IDLE_TIME (Go durations such as 30m), over the defaults.
func poolFromEnv(cfg *pgxpool.Config, getenv func(string) string) error {
	cfg.MaxConns, cfg.MinConns = defaultMaxConns, defaultMinConns
	cfg.MaxConnLifetime, cfg.MaxConnIdleTime = defaultMaxConnLifetime, defaultMaxConnIdleTime
	for key, into := range map[string]*int32{"DB_MAX_CONNS": &cfg.MaxConns, "DB_MIN_CONNS": &cfg.MinConns} {
		if v := getenv(key); v != "" {
			n, err := strconv.ParseInt(v, 10, 32)
			if err != nil || n < 0 {
				return fmt.Errorf("%s=%q: want a whole number of at least 0", key, v)
			}
			*into = int32(n)
		}
	}
	for key, into := range map[string]*time.Duration{"DB_MAX_CONN_LIFETIME": &cfg.MaxConnLifetime, "DB_MAX_CONN_IDLE_TIME": &cfg.MaxConnIdleTime} {
		if v := getenv(key); v != "" {
			d, err := time.ParseDuration(v)
			if err != nil || d <= 0 {
				return fmt.Errorf("%s=%q: want a positive duration such as 30m", key, v)
			}
			*into = d
		}
	}
	if cfg.MaxConns < 1 || cfg.MinConns > cfg.MaxConns {
		return fmt.Errorf("DB_MAX_CONNS=%d and DB_MIN_CONNS=%d: want max of at least 1 and min no more than max", cfg.MaxConns, cfg.MinConns)
	}
	return nil
}
