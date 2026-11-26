package events_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/events"
)

func TestShapeRewritesRowsBeforeTheyLeave(t *testing.T) {
	scope := events.Scope{Shape: func(collection string, data json.RawMessage) json.RawMessage {
		if collection == "products" {
			return json.RawMessage(strings.Replace(string(data), `,"cost":5`, "", 1))
		}
		return nil
	}}
	change := events.Change{Upserts: map[string][]events.Row{
		"products": {{TenantID: "t", Data: json.RawMessage(`{"id":"p","cost":5}`)}},
		"pages":    {{TenantID: "t", Data: json.RawMessage(`{"id":"g"}`)}},
	}}
	payload, ok := scope.Filter(change)
	if !ok {
		t.Fatal("nothing kept")
	}
	out, _ := json.Marshal(payload)
	if strings.Contains(string(out), "cost") || strings.Contains(string(out), `"g"`) {
		t.Fatalf("shape not applied: %s", out)
	}
	if !strings.Contains(string(out), `"p"`) {
		t.Fatalf("shaped row dropped: %s", out)
	}
}

// A removal whose brand is unknown reaches only subscribers that see every brand.
func TestUnnamedRemovalsStayWithThePlatform(t *testing.T) {
	change := events.Change{Removes: map[string][]events.Removed{"categories": {{ID: "cat-x"}}}}
	if _, ok := (events.Scope{TenantIDs: []string{"ten-lari"}}).Filter(change); ok {
		t.Fatal("a brand subscriber received an unnamed removal")
	}
	if _, ok := (events.Scope{}).Filter(change); !ok {
		t.Fatal("the platform lost an unnamed removal")
	}
	named := events.Change{Removes: map[string][]events.Removed{"categories": {{TenantID: "ten-aruna", ID: "cat-y"}}}}
	if _, ok := (events.Scope{TenantIDs: []string{"ten-lari"}}).Filter(named); ok {
		t.Fatal("ten-lari received ten-aruna's removal")
	}
	if _, ok := (events.Scope{TenantIDs: []string{"ten-aruna"}}).Filter(named); !ok {
		t.Fatal("ten-aruna lost its own removal")
	}
}
