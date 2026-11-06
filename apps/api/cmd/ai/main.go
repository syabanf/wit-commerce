// Command ai serves the shopper AI chat, POST /api/v1/shop/{store}/ai/chat, as its own process.
// It shares the handler with cmd/api, which keeps serving the same route; nginx decides which one
// gets the traffic. The schema belongs to cmd/api, so this process never migrates or seeds.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/dotenv"

	"github.com/syabanf/wit-commerce/apps/api/internal/ai"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Version is set at build time with -ldflags "-X main.Version=...".
var Version = "dev"

type config struct {
	databaseURL    string
	port           int
	ollamaURL      string
	ollamaKey      string
	ollamaModel    string
	trustProxy     bool
	allowedOrigins []string
}

// loadConfig reads the same variables cmd/api reads for these settings.
func loadConfig() (config, error) {
	c := config{
		databaseURL: os.Getenv("DATABASE_URL"),
		port:        8091,
		ollamaURL:   os.Getenv("OLLAMA_URL"),
		ollamaKey:   os.Getenv("OLLAMA_API_KEY"),
		ollamaModel: os.Getenv("OLLAMA_MODEL"),
		trustProxy:  os.Getenv("TRUST_PROXY") == "true",
	}
	if c.databaseURL == "" {
		return c, fmt.Errorf("missing environment: DATABASE_URL")
	}
	if v := os.Getenv("PORT"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return c, fmt.Errorf("PORT: %w", err)
		}
		c.port = n
	}
	for _, o := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			c.allowedOrigins = append(c.allowedOrigins, o)
		}
	}
	return c, nil
}

// handler builds the chat handler; without OLLAMA_API_KEY the route answers 503 AI_OFF.
func handler(cfg config, db *store.DB, anchor time.Time, log *slog.Logger) http.Handler {
	return httpapi.NewAIHandler(httpapi.Options{
		DB: db, Clock: clock.New(anchor), AI: ai.New(cfg.ollamaURL, cfg.ollamaKey, cfg.ollamaModel),
		TrustProxy: cfg.trustProxy, AllowedOrigins: cfg.allowedOrigins, Log: log, Version: Version,
	})
}

func main() {
	dotenv.Load(".env")
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(context.Background(), log); err != nil {
		log.Error("ai stopped", "err", err)
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
	anchor, err := db.Anchor(ctx)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()
	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.port),
		Handler:           handler(cfg, db, anchor, log),
		ReadHeaderTimeout: 10 * time.Second,
	}
	errc := make(chan error, 1)
	go func() { errc <- server.ListenAndServe() }()
	log.Info("ai listening", "port", cfg.port, "version", Version, "model", cfg.ollamaKey != "")
	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return server.Shutdown(shutdown)
}
