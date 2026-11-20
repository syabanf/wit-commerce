package kernel

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestTruncateIPKeepsTheNetworkOnly(t *testing.T) {
	for in, want := range map[string]string{
		"203.0.113.77":          "203.0.113.0/24",
		"203.0.113.77:51234":    "203.0.113.0/24",
		"2001:db8:abcd:12::1":   "2001:db8:abcd::/48",
		"[2001:db8:abcd::9]:80": "2001:db8:abcd::/48",
		"not an address":        "",
	} {
		if got := TruncateIP(in); got != want {
			t.Errorf("TruncateIP(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestDiffRedactsSecretsPersonalDataAndLargeValues(t *testing.T) {
	before := json.RawMessage(`{"id":"o1","status":"paid","shipping":{"name":"A","address":"Jl. Sudirman 1"},"note":"x","passwordHash":"old","description":"short"}`)
	after := json.RawMessage(`{"id":"o1","status":"shipped","shipping":{"name":"A","address":"Jl. Thamrin 2"},"note":"y","passwordHash":"new","description":"` + strings.Repeat("long ", 60) + `"}`)
	c := diff(rowKey{"orders", "o1"}, before, after, true)
	if c.Op != "update" {
		t.Fatalf("op %s", c.Op)
	}
	for _, f := range []string{"shipping", "passwordHash", "description"} {
		if c.Fields[f] != "changed" {
			t.Errorf("%s = %v, want \"changed\"", f, c.Fields[f])
		}
	}
	if status, _ := c.Fields["status"].(map[string]any); status["before"] != "paid" || status["after"] != "shipped" {
		t.Errorf("status %v", c.Fields["status"])
	}
	// Typed text can name anyone, so a note is never kept.
	if c.Fields["note"] != "changed" {
		t.Errorf("order note %v", c.Fields["note"])
	}
	cust := diff(rowKey{"customers", "c1"}, json.RawMessage(`{"name":"Old","note":"a","stage":"lead"}`),
		json.RawMessage(`{"name":"New","note":"b","stage":"customer"}`), true)
	if cust.Fields["name"] != "changed" || cust.Fields["note"] != "changed" || cust.Fields["stage"] == "changed" {
		t.Errorf("customer fields %v", cust.Fields)
	}
	raw, _ := json.Marshal([]AuditChange{c, cust})
	for _, leak := range []string{"Sudirman", "Thamrin", "new", "Old", "New"} {
		if strings.Contains(string(raw), `"`+leak) {
			t.Errorf("stored %q: %s", leak, raw)
		}
	}
}

func TestEntriesSkipUnchangedRowsAndCapLargeActions(t *testing.T) {
	a := &auditTrail{segments: []*auditSegment{{action: "stock/receive"}}, before: map[rowKey]json.RawMessage{}, after: map[rowKey]json.RawMessage{}}
	same := rowKey{"products", "p1"}
	a.segments[0].keys = append(a.segments[0].keys, same)
	a.before[same], a.after[same] = json.RawMessage(`{"a":1,"tenantId":"t"}`), json.RawMessage(`{"tenantId":"t","a":1}`)
	for i := range auditMaxRows + 5 {
		k := rowKey{"stockMoves", string(rune('a'+i%26)) + strings.Repeat("x", i)}
		a.segments[0].keys = append(a.segments[0].keys, k)
		a.after[k] = json.RawMessage(`{"tenantId":"t"}`)
	}
	entries := a.entries()
	if len(entries) != 1 {
		t.Fatalf("%d entries", len(entries))
	}
	e := entries[0]
	if e.collection != "stockMoves" || e.tenantID != "t" || len(e.refs) != auditMaxRows+5 {
		t.Errorf("entry %s %s %d refs", e.collection, e.tenantID, len(e.refs))
	}
	if last := e.changes[len(e.changes)-1]; last.Op != "more" || last.More != 5 {
		t.Errorf("last change %+v", last)
	}
}
