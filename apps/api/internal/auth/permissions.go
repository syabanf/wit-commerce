package auth

// Permissions mirror packages/fixtures/src/permissions.ts, so the server allows exactly what the
// console shows.
var all = []string{
	"tenant.manage", "brand.manage", "store.manage", "product.manage", "inventory.manage", "order.fulfil",
	"order.refund", "customer.manage", "segment.manage", "lead.manage", "ticket.manage", "campaign.manage",
	"automation.manage", "promotion.manage", "seller.manage", "integration.manage", "analytics.view",
}

var rolePermissions = map[string][]string{
	"platform_admin": all,
	"tenant_admin":   without(all, "tenant.manage"),
	"marketing": {"store.manage", "segment.manage", "campaign.manage", "automation.manage", "promotion.manage",
		"analytics.view"},
	"operations": {"product.manage", "inventory.manage", "order.fulfil", "order.refund", "analytics.view"},
	"service":    {"customer.manage", "ticket.manage", "order.refund", "lead.manage"},
	"sales":      {"lead.manage", "customer.manage"},
}

func without(list []string, drop string) []string {
	out := make([]string, 0, len(list))
	for _, p := range list {
		if p != drop {
			out = append(out, p)
		}
	}
	return out
}

// Can reports whether a role holds a permission.
func Can(role, permission string) bool {
	for _, p := range rolePermissions[role] {
		if p == permission {
			return true
		}
	}
	return false
}
