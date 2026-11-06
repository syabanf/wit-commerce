// Command notifier sends the email the API queues in email_outbox. It shares the API's database,
// CREDENTIALS_KEY and mail settings, and serves only /health. Run it with NOTIFIER_EXTERNAL=true on the API, or beside an
// API that drains too: each claim skips rows another worker holds.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/dotenv"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/mail"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/notifications"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Version is set at build time with -ldflags "-X main.Version=...".
var Version = "dev"

type config struct {
	databaseURL string
	port        int
	every       time.Duration
}

func loadConfig() (config, error) {
	c := config{databaseURL: os.Getenv("DATABASE_URL"), port: 8092, every: 2 * time.Second}
	if c.databaseURL == "" {
		return c, errors.New("missing environment: DATABASE_URL")
	}
	if v := os.Getenv("PORT"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return c, fmt.Errorf("PORT: %w", err)
		}
		c.port = n
	}
	if v := os.Getenv("NOTIFIER_INTERVAL"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil || d <= 0 {
			return c, fmt.Errorf("NOTIFIER_INTERVAL: want a positive duration such as 2s")
		}
		c.every = d
	}
	return c, nil
}

func main() {
	dotenv.Load(".env")
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(context.Background(), log); err != nil {
		log.Error("notifier stopped", "err", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, log *slog.Logger) error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	db, err := store.Open(ctx, cfg.databaseURL)
	if err != nil {
		return err
	}
	defer db.Pool.Close()
	vault, err := openVault()
	if err != nil {
		return err
	}
	if vault == nil {
		log.Warn("CREDENTIALS_KEY is not set; email settings saved in the console are ignored")
	}
	// The API owns migrations; this process only reads email_settings and updates email_outbox.
	n := &notifications.Notifications{
		Runtime:   &kernel.Runtime{DB: db, Vault: vault},
		Mail:      mail.New(os.Getenv("RESEND_URL"), os.Getenv("RESEND_API_KEY"), os.Getenv("EMAIL_FROM")),
		ResendURL: os.Getenv("RESEND_URL"),
		Log:       log,
	}

	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()
	// Each drain reads the email settings first, so the loop runs with email off too: a key saved in
	// the console starts the sending on the next drain.
	drained := make(chan struct{})
	go func() {
		defer close(drained)
		n.Run(ctx, cfg.every)
	}()

	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.port),
		Handler:           healthHandler(n),
		ReadHeaderTimeout: 10 * time.Second,
	}
	errc := make(chan error, 1)
	go func() { errc <- server.ListenAndServe() }()
	log.Info("notifier listening", "port", cfg.port, "version", Version, "every", cfg.every.String())
	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	err = server.Shutdown(shutdown)
	// Drain marks a send in flight before it returns, so waiting here keeps a sent row from
	// going out twice.
	select {
	case <-drained:
	case <-shutdown.Done():
	}
	return err
}

// openVault opens the key the API encrypts email settings with: CREDENTIALS_KEY, or in a demo the
// key the API derives from JWT_SECRET. Without either it returns nil.
func openVault() (*auth.Vault, error) {
	if key := os.Getenv("CREDENTIALS_KEY"); key != "" {
		return auth.NewVault(key)
	}
	if secret := os.Getenv("JWT_SECRET"); secret != "" && os.Getenv("DEMO_LOGIN") != "false" {
		return auth.DeriveVault(secret)
	}
	return nil, nil
}

// healthHandler answers GET /health with the queue depth, or 503 when the database is out of reach.
func healthHandler(n *notifications.Notifications) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		pending, err := n.Pending(r.Context())
		if err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]any{"status": "down", "version": Version})
			return
		}
		source := n.Source()
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "ok", "version": Version, "email": source != notifications.SourceOff, "emailSource": source, "pending": pending})
	})
	return mux
}
