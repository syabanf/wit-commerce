// Package store is the Postgres layer: one document table per entity, read and written whole.
package store

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Collection names are the AppState keys the apps use; Tables maps each to its Postgres table.
var Tables = map[string]string{
	"tenants":            "tenants",
	"users":              "users",
	"sellers":            "sellers",
	"templates":          "templates",
	"pages":              "pages",
	"categories":         "categories",
	"attributes":         "attributes",
	"modifiers":          "modifiers",
	"collections":        "collections",
	"products":           "products",
	"warehouses":         "warehouses",
	"stock":              "stock",
	"stockMoves":         "stock_moves",
	"modifierStock":      "modifier_stock",
	"modifierStockMoves": "modifier_stock_moves",
	"customers":          "customers",
	"customerEvents":     "customer_events",
	"orders":             "orders",
	"segments":           "segments",
	"leads":              "leads",
	"tickets":            "tickets",
	"campaigns":          "campaigns",
	"automations":        "automations",
	"promotions":         "promotions",
	"paymentTypes":       "payment_types",
	"agentPolicies":      "agent_policies",
	"integrations":       "integrations",
	"integrationLogs":    "integration_logs",
	"traffic":            "traffic",
	"searchTerms":        "search_terms",
}

// Collections lists every collection in a stable order (the AppState field order).
var Collections = []string{
	"tenants", "users", "sellers", "templates", "pages", "categories", "attributes", "modifiers",
	"collections", "products", "warehouses", "stock", "stockMoves", "modifierStock", "modifierStockMoves",
	"customers", "customerEvents", "orders", "segments", "leads", "tickets", "campaigns", "automations",
	"promotions", "paymentTypes", "agentPolicies", "integrations", "integrationLogs", "traffic", "searchTerms",
}

// Collections the apps show newest first; the loader orders them so the apps need not sort.
var newestFirst = map[string]string{
	"stockMoves":         "at",
	"modifierStockMoves": "at",
	"customerEvents":     "at",
	"integrationLogs":    "at",
}

// DB wraps the pool.
type DB struct {
	Pool *pgxpool.Pool
}

// Open connects and pings.
func Open(ctx context.Context, url string) (*DB, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("database url: %w", err)
	}
	cfg.MaxConns = 16
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("database ping: %w", err)
	}
	return &DB{Pool: pool}, nil
}

// Migrate applies every embedded migration that has not run yet, in file order.
func (db *DB) Migrate(ctx context.Context) error {
	if _, err := db.Pool.Exec(ctx, `create table if not exists schema_migrations (
		name text primary key, applied_at timestamptz not null default now())`); err != nil {
		return err
	}
	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		var done bool
		if err := db.Pool.QueryRow(ctx,
			`select exists (select 1 from schema_migrations where name = $1)`, name).Scan(&done); err != nil {
			return err
		}
		if done {
			continue
		}
		sql, err := migrations.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}
		if err := pgx.BeginFunc(ctx, db.Pool, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, string(sql)); err != nil {
				return fmt.Errorf("migration %s: %w", name, err)
			}
			_, err := tx.Exec(ctx, `insert into schema_migrations (name) values ($1)`, name)
			return err
		}); err != nil {
			return err
		}
	}
	return nil
}

// Querier is a pool or a transaction.
type Querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// ErrNotFound is returned by Get when no row has the id.
var ErrNotFound = errors.New("not found")

func table(collection string) string {
	t, ok := Tables[collection]
	if !ok {
		panic("unknown collection " + collection)
	}
	return t
}

// Get decodes one document into v.
func Get[T any](ctx context.Context, q Querier, collection, id string) (T, error) {
	var v T
	var raw []byte
	err := q.QueryRow(ctx, `select data from `+table(collection)+` where id = $1`, id).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return v, ErrNotFound
	}
	if err != nil {
		return v, err
	}
	return v, json.Unmarshal(raw, &v)
}

// Lock reads one document with a row lock, for read-modify-write inside a transaction.
func Lock[T any](ctx context.Context, q Querier, collection, id string) (T, error) {
	var v T
	var raw []byte
	err := q.QueryRow(ctx, `select data from `+table(collection)+` where id = $1 for update`, id).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return v, ErrNotFound
	}
	if err != nil {
		return v, err
	}
	return v, json.Unmarshal(raw, &v)
}

// List decodes every document that matches the where clause (without the keyword), newest first
// for event-like collections.
func List[T any](ctx context.Context, q Querier, collection, where string, args ...any) ([]T, error) {
	// A trailing "for update" in the where clause moves after the ordering, where SQL wants it.
	lock := ""
	if strings.HasSuffix(where, " for update") {
		where, lock = strings.TrimSuffix(where, " for update"), " for update"
	}
	sql := `select data from ` + table(collection)
	if where != "" {
		sql += " where " + where
	}
	if _, ok := newestFirst[collection]; ok {
		sql += " order by at desc, id desc"
	} else {
		sql += " order by id"
	}
	sql += lock
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []T{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var v T
		if err := json.Unmarshal(raw, &v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// ListTenant lists a tenant's documents.
func ListTenant[T any](ctx context.Context, q Querier, collection, tenantID string) ([]T, error) {
	return List[T](ctx, q, collection, "tenant_id = $1", tenantID)
}

// PageQuery selects one page of a tenant's documents, by id order.
type PageQuery struct {
	TenantID string
	Cursor   string
	Limit    int
	// Status filters collections that have a status column; "" means any.
	Status string
	// UpdatedSince keeps rows changed at or after an instant, for incremental sync.
	UpdatedSince *time.Time
}

// Page reads up to Limit documents after Cursor and returns the cursor of the next page, if any.
func Page(ctx context.Context, q Querier, collection string, in PageQuery) ([]json.RawMessage, string, error) {
	where := []string{"tenant_id = $1"}
	args := []any{in.TenantID}
	add := func(clause string, arg any) {
		args = append(args, arg)
		where = append(where, fmt.Sprintf(clause, len(args)))
	}
	if in.Cursor != "" {
		add("id > $%d", in.Cursor)
	}
	if in.Status != "" {
		add("status = $%d", in.Status)
	}
	if in.UpdatedSince != nil {
		add("updated_at >= $%d", *in.UpdatedSince)
	}
	args = append(args, in.Limit+1)
	rows, err := q.Query(ctx, fmt.Sprintf(`select id, data from %s where %s order by id limit $%d`,
		table(collection), strings.Join(where, " and "), len(args)), args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	next := ""
	last := ""
	for rows.Next() {
		var id string
		var raw []byte
		if err := rows.Scan(&id, &raw); err != nil {
			return nil, "", err
		}
		if len(items) == in.Limit {
			next = last
			break
		}
		items = append(items, raw)
		last = id
	}
	return items, next, rows.Err()
}

// Put inserts or replaces a document.
func Put(ctx context.Context, q Querier, collection, id string, v any) error {
	raw, err := json.Marshal(v)
	if err != nil {
		return err
	}
	// A row keeps its tenant: an id that belongs to another tenant reads as missing, so a save can
	// never move or overwrite someone else's record.
	t := table(collection)
	tag, err := q.Exec(ctx, `insert into `+t+` (id, data) values ($1, $2)
		on conflict (id) do update set data = excluded.data, updated_at = now()
		where `+t+`.data->>'tenantId' is not distinct from excluded.data->>'tenantId'`, id, raw)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete removes a document; missing rows are not an error.
func Delete(ctx context.Context, q Querier, collection, id string) error {
	_, err := q.Exec(ctx, `delete from `+table(collection)+` where id = $1`, id)
	return err
}

// Raw lists documents as raw JSON, for the state endpoints that pass them through untouched.
func Raw(ctx context.Context, q Querier, collection, where string, args ...any) ([]json.RawMessage, error) {
	return List[json.RawMessage](ctx, q, collection, where, args...)
}

// Meta reads a key from the meta table.
func (db *DB) Meta(ctx context.Context, key string) (string, bool, error) {
	var value string
	err := db.Pool.QueryRow(ctx, `select value from meta where key = $1`, key).Scan(&value)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	return value, err == nil, err
}

// SetMeta writes a key.
func (db *DB) SetMeta(ctx context.Context, key, value string) error {
	_, err := db.Pool.Exec(ctx, `insert into meta (key, value) values ($1, $2)
		on conflict (key) do update set value = excluded.value`, key, value)
	return err
}

// Anchor returns the real instant the demo clock maps to FixtureNow, writing it on first use.
func (db *DB) Anchor(ctx context.Context) (time.Time, error) {
	if value, ok, err := db.Meta(ctx, "clock_anchor"); err != nil {
		return time.Time{}, err
	} else if ok {
		return time.Parse(time.RFC3339Nano, value)
	}
	now := time.Now().UTC()
	return now, db.SetMeta(ctx, "clock_anchor", now.Format(time.RFC3339Nano))
}

// IsEmpty reports whether the tenants table has no rows, so boot knows to seed.
func (db *DB) IsEmpty(ctx context.Context) (bool, error) {
	var n int
	err := db.Pool.QueryRow(ctx, `select count(*) from tenants`).Scan(&n)
	return n == 0, err
}

// Truncate empties every entity table (dev reset).
func (db *DB) Truncate(ctx context.Context) error {
	names := make([]string, 0, len(Tables)+10)
	for _, t := range Tables {
		names = append(names, t)
	}
	names = append(names, "credentials", "customer_credentials", "email_tokens", "staff_events", "order_rows", "customer_metrics", "sales_days", "product_days", "seller_buyers", "request_log", "api_credentials", "connector_secrets", "credential_events", "webhook_endpoints", "webhook_deliveries", "email_outbox", "event_log", "email_settings", "payments")
	_, err := db.Pool.Exec(ctx, `truncate `+strings.Join(names, ", "))
	return err
}

// Where helpers shared by the state loaders.
func TenantIn(ids []string) (string, []any) {
	if len(ids) == 0 {
		return "false", nil
	}
	return "tenant_id = any($1)", []any{ids}
}
