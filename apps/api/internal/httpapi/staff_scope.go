package httpapi

import (
	"encoding/json"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
)

// A staff member works for a brand but holds no back-office permission: the console shows them the
// employee area only. The server keeps them to it as well, so a token cannot read what the screens
// hide: the brand, the colleagues' names and the tickets assigned to them, nothing more.

const staffRole = "staff"

// employeeOnly reports whether the principal is a person with the employee area alone.
func employeeOnly(p auth.Principal) bool { return p.Kind == auth.KindUser && p.Role == staffRole }

const noBrandData = "Your role works in the employee area only."

// staffCollections is what a staff member's state holds; every other collection comes back empty.
var staffCollections = []string{"tenants", "users", "tickets"}

// assignedTo keeps the ticket rows assigned to one person.
func assignedTo(rows []json.RawMessage, userID string) ([]json.RawMessage, error) {
	kept := []json.RawMessage{}
	for _, raw := range rows {
		var t struct {
			AssigneeID *string `json:"assigneeId"`
		}
		if err := json.Unmarshal(raw, &t); err != nil {
			return nil, err
		}
		if t.AssigneeID != nil && *t.AssigneeID == userID {
			kept = append(kept, raw)
		}
	}
	return kept, nil
}

// staffStreamScope carries the same three collections, and of the tickets only the person's own.
func staffStreamScope(tenantIDs []string, userID string) events.Scope {
	allowed := map[string]bool{}
	for _, c := range staffCollections {
		allowed[c] = true
	}
	return events.Scope{TenantIDs: tenantIDs, Collections: allowed, Keep: func(collection string, data json.RawMessage) bool {
		if collection != "tickets" {
			return true
		}
		kept, err := assignedTo([]json.RawMessage{data}, userID)
		return err == nil && len(kept) == 1
	}}
}
