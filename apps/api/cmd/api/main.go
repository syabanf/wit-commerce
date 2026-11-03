// Command api runs the Commerce OS backend: Postgres behind a JSON API with server-sent events.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/ai"
	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Version is set at build time with -ldflags "-X main.Version=...".
var Version = "dev"

type config struct {
	databaseURL    string
	jwtSecret      string
	demoPassword   string
	credentialsKey string
	demoLogin      bool
	seedDir        string
	port           int
	allowedOrigins []string
	tickEvery      time.Duration
}

// loadConfig reads the environment and fails fast on what the service cannot run without.
func loadConfig() (config, error) {
	c := config{
		databaseURL:    os.Getenv("DATABASE_URL"),
		jwtSecret:      os.Getenv("JWT_SECRET"),
		demoPassword:   os.Getenv("DEMO_PASSWORD"),
		credentialsKey: os.Getenv("CREDENTIALS_KEY"),
		seedDir:        os.Getenv("SEED_DIR"),
		port:           8090,
		tickEvery:      time.Minute,
	}
	var missing []string
	if c.databaseURL == "" {
		missing = append(missing, "DATABASE_URL")
	}
	if c.jwtSecret == "" {
		missing = append(missing, "JWT_SECRET")
	}
	if len(missing) > 0 {
		return c, fmt.Errorf("missing environment: %s", strings.Join(missing, ", "))
	}
	if v := os.Getenv("PORT"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return c, fmt.Errorf("PORT: %w", err)
		}
		c.port = n
	}
	c.demoLogin = os.Getenv("DEMO_LOGIN") != "false"
	if c.demoLogin && c.demoPassword == "" {
		c.demoPassword = "commerce-demo"
	}
	if c.seedDir == "" {
		c.seedDir = filepath.Join("..", "..", "packages", "fixtures", "data")
	}
	if v := os.Getenv("ALLOWED_ORIGINS"); v != "" {
		for _, o := range strings.Split(v, ",") {
			if o = strings.TrimSpace(o); o != "" {
				c.allowedOrigins = append(c.allowedOrigins, o)
			}
		}
	}
	return c, nil
}

func main() {
	reset := flag.Bool("reset", false, "empty every table and load the seed again")
	exit := flag.Bool("exit", false, "stop after migrating and seeding, without serving")
	spec := flag.Bool("openapi", false, "print the OpenAPI document and stop; needs no database")
	flag.Parse()
	loadDotEnv(".env")
	if *spec {
		_, _ = os.Stdout.Write(httpapi.New(httpapi.Options{Version: Version}).Spec())
		return
	}
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(context.Background(), log, *reset, *exit); err != nil {
		log.Error("api stopped", "err", err)
		os.Exit(1)
	}
}

// openVault needs CREDENTIALS_KEY once demo sign-in is off; a demo may derive one from JWT_SECRET,
// and changing that secret then loses the stored connector values.
func openVault(cfg config, log *slog.Logger) (*auth.Vault, error) {
	if cfg.credentialsKey != "" {
		return auth.NewVault(cfg.credentialsKey)
	}
	if !cfg.demoLogin {
		return nil, errors.New("missing environment: CREDENTIALS_KEY (openssl rand -base64 32)")
	}
	log.Warn("CREDENTIALS_KEY is not set; deriving the connector key from JWT_SECRET")
	return auth.DeriveVault(cfg.jwtSecret)
}

func run(ctx context.Context, log *slog.Logger, reset, exit bool) error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	signer, err := auth.NewSigner(cfg.jwtSecret, 12*time.Hour)
	if err != nil {
		return err
	}
	vault, err := openVault(cfg, log)
	if err != nil {
		return err
	}
	db, err := store.Open(ctx, cfg.databaseURL)
	if err != nil {
		return err
	}
	defer db.Pool.Close()
	if err := db.Migrate(ctx); err != nil {
		return err
	}
	if reset {
		if err := db.Truncate(ctx); err != nil {
			return err
		}
		log.Info("tables emptied")
	}
	empty, err := db.IsEmpty(ctx)
	if err != nil {
		return err
	}
	if empty {
		started := time.Now()
		if err := seed.Load(ctx, db, cfg.seedDir, cfg.demoPassword); err != nil {
			return fmt.Errorf("seed from %s: %w", cfg.seedDir, err)
		}
		log.Info("seed loaded", "dir", cfg.seedDir, "ms", time.Since(started).Milliseconds())
	}
	anchor, err := db.Anchor(ctx)
	if err != nil {
		return err
	}
	if exit {
		return nil
	}
	allowInternal := os.Getenv("WEBHOOK_ALLOW_INTERNAL") == "true"
	srv := httpapi.New(httpapi.Options{
		DB: db, Clock: clock.New(anchor), Signer: signer, Vault: vault,
		Outbound: service.OutboundClient(allowInternal), AllowInternalWebhooks: allowInternal,
		AI:         ai.New(os.Getenv("OLLAMA_URL"), os.Getenv("OLLAMA_API_KEY"), os.Getenv("OLLAMA_MODEL")),
		TrustProxy: os.Getenv("TRUST_PROXY") == "true", Hub: events.New(), Log: log, Version: Version,
		DemoLogin: cfg.demoLogin, AllowedOrigins: cfg.allowedOrigins,
	})

	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		t := time.NewTicker(cfg.tickEvery)
		defer t.Stop()
		for {
			if err := srv.RunTick(ctx); err != nil && ctx.Err() == nil {
				log.Error("tick failed", "err", err)
			}
			select {
			case <-ctx.Done():
				return
			case <-t.C:
			}
		}
	}()

	go func() {
		t := time.NewTicker(5 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if err := srv.RunWebhooks(ctx); err != nil && ctx.Err() == nil {
					log.Error("webhook delivery failed", "err", err)
				}
			}
		}
	}()

	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.port),
		Handler:           srv,
		ReadHeaderTimeout: 10 * time.Second,
	}
	errc := make(chan error, 1)
	go func() { errc <- server.ListenAndServe() }()
	log.Info("api listening", "port", cfg.port, "version", Version, "demoLogin", cfg.demoLogin)
	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return server.Shutdown(shutdown)
}
