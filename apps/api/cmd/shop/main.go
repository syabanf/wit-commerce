// Command shop serves the storefront's public reads (the store list, a store's dataset and its event
// stream) apart from the API, so shopper traffic scales on its own. It reads the API's database and
// receives live changes from the API through Postgres NOTIFY; see DEPLOY.md.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/dotenv"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Version is set at build time with -ldflags "-X main.Version=...".
var Version = "dev"

func main() {
	dotenv.Load(".env")
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(context.Background(), log); err != nil {
		log.Error("shop stopped", "err", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, log *slog.Logger) error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return errors.New("missing environment: DATABASE_URL")
	}
	port := 8093
	if v := os.Getenv("PORT"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return fmt.Errorf("PORT: %w", err)
		}
		port = n
	}
	var origins []string
	for _, o := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			origins = append(origins, o)
		}
	}

	// The API owns the schema: it migrates and seeds, and this process only reads.
	db, err := store.Open(ctx, databaseURL)
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
	hub := events.New()
	go events.Listen(ctx, db.Pool, hub, log)

	// Event streams never end on their own, so shutdown cancels every request's context.
	base, cancelRequests := context.WithCancel(context.Background())
	defer cancelRequests()
	server := &http.Server{
		Addr: fmt.Sprintf(":%d", port),
		Handler: httpapi.NewShopReadHandler(httpapi.Options{
			DB: db, Clock: clock.New(anchor), Hub: hub, Log: log, Version: Version, AllowedOrigins: origins,
		}),
		BaseContext:       func(net.Listener) context.Context { return base },
		ReadHeaderTimeout: 10 * time.Second,
	}
	server.RegisterOnShutdown(cancelRequests)
	errc := make(chan error, 1)
	go func() { errc <- server.ListenAndServe() }()
	log.Info("shop listening", "port", port, "version", Version)
	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return server.Shutdown(shutdown)
}
