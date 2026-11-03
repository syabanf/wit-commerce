package httpapi_test

import (
	"encoding/json"
	"strings"
	"testing"
)

type eventsPage struct {
	Events []struct {
		ID         int64  `json:"id"`
		ActorName  string `json:"actorName"`
		TargetName string `json:"targetName"`
		Action     string `json:"action"`
		Detail     string `json:"detail"`
	} `json:"events"`
	NextBefore *int64 `json:"nextBefore"`
}

func (e *env) events(token, query string) eventsPage {
	e.t.Helper()
	var out eventsPage
	if code := e.call("GET", "/users/events?"+query, token, nil, &out); code != 200 {
		e.t.Fatalf("events: %d", code)
	}
	return out
}

func TestStaffChangesLandInTheHistory(t *testing.T) {
	e := setup(t)
	made := e.create(e.admin, newStaff("h@example.com", "marketing", "ten-lari"))
	path := "/users/" + made.User.ID
	update := newStaff("", "operations", "ten-lari")
	update["name"] = "Renamed Person"
	e.expect(200, "PUT", path, e.admin, update)
	// An edit that changes nothing adds no line.
	e.expect(200, "PUT", path, e.admin, update)
	e.expect(200, "POST", path+"/status", e.admin, map[string]bool{"disabled": true})
	e.expect(200, "POST", path+"/status", e.admin, map[string]bool{"disabled": false})
	var reset staffIssued
	e.call("POST", path+"/reset-password", e.admin, nil, &reset)

	page := e.events(e.admin, "tenantId=ten-lari")
	var actions []string
	for _, event := range page.Events {
		actions = append(actions, event.Action)
	}
	want := "password_reset enabled disabled updated created"
	if strings.Join(actions, " ") != want {
		t.Errorf("actions: %v, want %s", actions, want)
	}
	updated := page.Events[3]
	if updated.ActorName != "Andi Pratama" || updated.TargetName != "Renamed Person" ||
		!strings.Contains(updated.Detail, "role: marketing → operations") || !strings.Contains(updated.Detail, "name: New Person → Renamed Person") {
		t.Errorf("update line: %+v", updated)
	}
	raw, _ := json.Marshal(page)
	if strings.Contains(string(raw), reset.TemporaryPassword) || strings.Contains(string(raw), made.TemporaryPassword) {
		t.Error("the history holds a password")
	}
}

func TestARefusedChangeLeavesNoLine(t *testing.T) {
	e := setup(t)
	dewi := e.login("dewi@commerceos.id")
	e.expect(409, "POST", "/users/usr-dewi/status", dewi, map[string]bool{"disabled": true})
	e.expect(403, "POST", "/users/usr-dewi/reset-password", e.admin, nil)
	if page := e.events(dewi, "tenantId=ten-lari"); len(page.Events) != 0 {
		t.Errorf("lines: %+v", page.Events)
	}
}

func TestHistoryStaysWithinTheBrand(t *testing.T) {
	e := setup(t)
	hendra := e.login("hendra@teknika.co.id")
	e.create(hendra, newStaff("tk@example.com", "marketing", "ten-teknika"))
	dewi := e.login("dewi@commerceos.id")
	e.create(dewi, newStaff("pa@example.com", "platform_admin"))

	e.expect(403, "GET", "/users/events?tenantId=ten-teknika", e.admin, nil)
	e.expect(403, "GET", "/users/events", e.admin, nil)
	e.expect(403, "GET", "/users/events?tenantId=ten-lari", e.login("maya@lari.co.id"), nil)
	e.expect(403, "GET", "/users/events?tenantId=ten-lari", e.issue("customers:write").Secret, nil)
	if page := e.events(e.admin, "tenantId=ten-lari"); len(page.Events) != 0 {
		t.Errorf("a Lari admin read other lines: %+v", page.Events)
	}
	page := e.events(dewi, "tenantId=ten-lari")
	if len(page.Events) != 1 || page.Events[0].TargetName != "New Person" {
		t.Errorf("a platform admin should read platform lines: %+v", page.Events)
	}
}

func TestHistoryPages(t *testing.T) {
	e := setup(t)
	made := e.create(e.admin, newStaff("p@example.com", "marketing", "ten-lari"))
	for range 16 {
		e.expect(200, "POST", "/users/"+made.User.ID+"/status", e.admin, map[string]bool{"disabled": true})
		e.expect(200, "POST", "/users/"+made.User.ID+"/status", e.admin, map[string]bool{"disabled": false})
	}
	first := e.events(e.admin, "tenantId=ten-lari")
	if len(first.Events) != 30 || first.NextBefore == nil {
		t.Fatalf("first page: %d lines, next %v", len(first.Events), first.NextBefore)
	}
	second := e.events(e.admin, "tenantId=ten-lari&before="+jsonNumber(*first.NextBefore))
	if len(second.Events) != 3 || second.NextBefore != nil {
		t.Errorf("second page: %d lines, next %v", len(second.Events), second.NextBefore)
	}
}

func jsonNumber(n int64) string {
	raw, _ := json.Marshal(n)
	return string(raw)
}
