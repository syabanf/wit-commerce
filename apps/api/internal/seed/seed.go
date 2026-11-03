// Package seed loads the generated demo data (packages/fixtures/data) into Postgres, so the API shows
// the same stores, orders and customers the apps showed from their bundled fixtures.
package seed

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/jackc/pgx/v5"

	"errors"
	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
	"strings"
)

// Files maps each collection to its JSON file in the data directory.
var files = map[string]string{
	"tenants":         "tenants.json",
	"users":           "users.json",
	"sellers":         "sellers.json",
	"templates":       "templates.json",
	"pages":           "pages.json",
	"categories":      "categories.json",
	"attributes":      "attributes.json",
	"modifiers":       "modifiers.json",
	"collections":     "collections.json",
	"products":        "products.json",
	"warehouses":      "warehouses.json",
	"stock":           "stock.json",
	"stockMoves":      "stock-moves.json",
	"customers":       "customers.json",
	"customerEvents":  "customer-events.json",
	"orders":          "orders.json",
	"segments":        "segments.json",
	"leads":           "leads.json",
	"tickets":         "tickets.json",
	"campaigns":       "campaigns.json",
	"automations":     "automations.json",
	"promotions":      "promotions.json",
	"paymentTypes":    "payment-types.json",
	"agentPolicies":   "agent-policies.json",
	"integrations":    "integrations.json",
	"integrationLogs": "integration-logs.json",
	"traffic":         "traffic.json",
	"searchTerms":     "search-terms.json",
}

type row struct {
	ID   string          `json:"id"`
	Data json.RawMessage `json:"-"`
}

// Load reads every file and inserts it in one transaction. demoPassword becomes every user's
// password; an empty string leaves users without a credential.
func Load(ctx context.Context, db *store.DB, dir, demoPassword string) error {
	docs := map[string][]json.RawMessage{}
	for collection, file := range files {
		raw, err := os.ReadFile(filepath.Join(dir, file))
		if err != nil {
			return fmt.Errorf("seed %s: %w", collection, err)
		}
		var list []json.RawMessage
		if err := json.Unmarshal(raw, &list); err != nil {
			return fmt.Errorf("seed %s: %w", collection, err)
		}
		docs[collection] = list
	}
	modifierStock, moves, err := deriveModifierStock(docs["modifiers"], docs["warehouses"])
	if err != nil {
		return err
	}
	docs["modifierStock"] = modifierStock
	docs["modifierStockMoves"] = moves

	return pgx.BeginFunc(ctx, db.Pool, func(tx pgx.Tx) error {
		for _, collection := range store.Collections {
			rows := make([][]any, 0, len(docs[collection]))
			for _, doc := range docs[collection] {
				id, err := idOf(collection, doc)
				if err != nil {
					return err
				}
				rows = append(rows, []any{id, doc})
			}
			if len(rows) == 0 {
				continue
			}
			if _, err := tx.CopyFrom(ctx, pgx.Identifier{store.Tables[collection]}, []string{"id", "data"},
				pgx.CopyFromRows(rows)); err != nil {
				return fmt.Errorf("seed %s: %w", collection, err)
			}
		}
		if demoPassword == "" {
			return nil
		}
		hash, err := auth.HashPassword(demoPassword)
		if err != nil {
			return err
		}
		for _, doc := range docs["users"] {
			var u row
			if err := json.Unmarshal(doc, &u); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `insert into credentials (user_id, password_hash) values ($1, $2)`,
				u.ID, hash); err != nil {
				return err
			}
		}
		return nil
	})
}

// EnsureAdmin creates a platform admin, or resets the password of the account with that email. It
// is how a deployment with demo sign-in off gets its first account.
func EnsureAdmin(ctx context.Context, db *store.DB, email, name, password string) error {
	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}
	email = strings.ToLower(strings.TrimSpace(email))
	admin := domain.User{ID: ids.New("usr"), Name: name, Email: email, Title: "Platform admin", Role: "platform_admin", TenantIDs: []string{}, Color: "#4c5a78"}
	doc, err := json.Marshal(admin)
	if err != nil {
		return err
	}
	return pgx.BeginFunc(ctx, db.Pool, func(tx pgx.Tx) error {
		var id string
		err := tx.QueryRow(ctx, `select id from users where email = $1`, email).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			id = admin.ID
			if _, err := tx.Exec(ctx, `insert into users (id, data) values ($1, $2)`, id, doc); err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `insert into credentials (user_id, password_hash) values ($1, $2)
			on conflict (user_id) do update set password_hash = excluded.password_hash, updated_at = now()`, id, hash)
		return err
	})
}

// idOf finds a document's id; agent policies are keyed by tenant.
func idOf(collection string, doc json.RawMessage) (string, error) {
	var keys struct {
		ID       string `json:"id"`
		TenantID string `json:"tenantId"`
	}
	if err := json.Unmarshal(doc, &keys); err != nil {
		return "", err
	}
	if collection == "agentPolicies" {
		return keys.TenantID, nil
	}
	if keys.ID == "" {
		return "", fmt.Errorf("seed %s: a document has no id", collection)
	}
	return keys.ID, nil
}

// deriveModifierStock mirrors packages/fixtures/src/data.ts: every tracked modifier option gets a
// stock level per warehouse of its tenant and one opening receipt.
func deriveModifierStock(modifiers, warehouses []json.RawMessage) ([]json.RawMessage, []json.RawMessage, error) {
	var groups []domain.ModifierGroup
	var houses []domain.Warehouse
	for _, m := range modifiers {
		var g domain.ModifierGroup
		if err := json.Unmarshal(m, &g); err != nil {
			return nil, nil, err
		}
		groups = append(groups, g)
	}
	for _, w := range warehouses {
		var h domain.Warehouse
		if err := json.Unmarshal(w, &h); err != nil {
			return nil, nil, err
		}
		houses = append(houses, h)
	}
	var levels, moves []json.RawMessage
	for _, g := range groups {
		for _, w := range houses {
			if w.TenantID != g.TenantID {
				continue
			}
			for i, o := range g.Options {
				if !o.Tracked() {
					continue
				}
				onHand := 24 + i*6
				if i == len(g.Options)-1 {
					onHand = 4
				}
				level := domain.ModifierStockLevel{
					ID: "mstk-" + o.ID + "-" + w.ID, TenantID: g.TenantID, GroupID: g.ID, OptionID: o.ID,
					WarehouseID: w.ID, OnHand: onHand, Reserved: 0, Safety: 5,
				}
				move := domain.ModifierStockMove{
					ID: "mmv-seed-" + level.ID, TenantID: g.TenantID, GroupID: g.ID, OptionID: o.ID,
					WarehouseID: w.ID, Kind: "receipt", Qty: onHand, At: clock.FixtureNow, By: "system",
					Note: "Opening stock",
				}
				l, _ := json.Marshal(level)
				m, _ := json.Marshal(move)
				levels = append(levels, l)
				moves = append(moves, m)
			}
		}
	}
	return levels, moves, nil
}
