package auth

import (
	"slices"
	"strings"
)

// Scope is what an API key may do. Write implies read of the same resource.
type Scope struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// Scopes is the catalog a credential picks from, in display order.
var Scopes = []Scope{
	{"catalog:read", "Read products, categories, collections and modifiers"},
	{"catalog:write", "Change products, categories, collections and modifiers"},
	{"inventory:read", "Read stock levels and warehouses"},
	{"inventory:write", "Receive and adjust stock"},
	{"orders:read", "Read orders"},
	{"orders:write", "Place, advance, cancel and refund orders"},
	{"customers:read", "Read customers"},
	{"customers:write", "Change customers and loyalty points"},
	{"leads:read", "Read leads"},
	{"leads:write", "Create and move leads"},
	{"tickets:read", "Read support tickets"},
	{"tickets:write", "Assign and resolve support tickets"},
	{"marketing:read", "Read segments, campaigns, automations and promotions"},
	{"marketing:write", "Change segments, campaigns, automations and promotions"},
	{"store:read", "Read sellers and payment types"},
	{"store:write", "Change brand, pages and sellers"},
}

// scopeOfPermission is the scope an API key needs for a console permission. Permissions left out
// (tenant.manage, integration.manage, user.manage) stay with signed-in people: a key cannot mint
// keys or create staff.
var scopeOfPermission = map[string]string{
	"product.manage":    "catalog:write",
	"inventory.manage":  "inventory:write",
	"order.fulfil":      "orders:write",
	"order.refund":      "orders:write",
	"customer.manage":   "customers:write",
	"lead.manage":       "leads:write",
	"ticket.manage":     "tickets:write",
	"segment.manage":    "marketing:write",
	"campaign.manage":   "marketing:write",
	"automation.manage": "marketing:write",
	"promotion.manage":  "marketing:write",
	"brand.manage":      "store:write",
	"store.manage":      "store:write",
	"seller.manage":     "store:write",
}

// ScopeFor is the scope a permission maps to; "" means API keys cannot use it.
func ScopeFor(permission string) string { return scopeOfPermission[permission] }

// ValidScope reports whether an id is in the catalog.
func ValidScope(id string) bool {
	return slices.ContainsFunc(Scopes, func(s Scope) bool { return s.ID == id })
}

// HasScope reports whether the principal holds a scope, directly or through its write form.
func (p Principal) HasScope(scope string) bool {
	if slices.Contains(p.Scopes, scope) {
		return true
	}
	if resource, ok := strings.CutSuffix(scope, ":read"); ok {
		return slices.Contains(p.Scopes, resource+":write")
	}
	return false
}
