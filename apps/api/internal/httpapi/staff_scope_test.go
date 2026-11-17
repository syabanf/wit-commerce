package httpapi_test

import (
	"bufio"
	"context"
	"net/http"
	"strings"
	"testing"
	"time"
)

// A staff member sees the employee area only, so the API hands them the brand, colleagues' names
// and their own tickets, and refuses every route that reads brand data.
func TestStaffReadsOnlyTheirOwnTickets(t *testing.T) {
	e := setup(t)
	made := e.create(e.admin, newStaff("staff@example.com", "staff", "ten-lari"))
	token := e.signIn("staff@example.com", made.TemporaryPassword)
	// Give the new person one of the brand's tickets.
	var ticketID string
	if err := e.db.Pool.QueryRow(context.Background(), `update tickets set data = jsonb_set(data, '{assigneeId}', to_jsonb($1::text))
		where id = (select id from tickets where tenant_id = 'ten-lari' order by id limit 1) returning id`, made.User.ID).Scan(&ticketID); err != nil {
		t.Fatal(err)
	}

	var state struct {
		State map[string][]map[string]any `json:"state"`
	}
	if code := e.call("GET", "/state", token, nil, &state); code != 200 {
		t.Fatalf("state: %d", code)
	}
	for collection, rows := range state.State {
		switch collection {
		case "tenants", "users":
		case "tickets":
			if len(rows) != 1 || rows[0]["id"] != ticketID {
				t.Fatalf("staff state carried tickets %v, want only %s", rows, ticketID)
			}
		default:
			if len(rows) != 0 {
				t.Errorf("staff state carried %d %s rows", len(rows), collection)
			}
		}
	}
	if _, ok := state.State["orders"]; !ok {
		t.Fatal("staff state lacks the empty orders list the console expects")
	}

	for _, path := range []string{"/views/orders?tenantId=ten-lari", "/customers?tenantId=ten-lari", "/orders?tenantId=ten-lari", "/views/customer-events?tenantId=ten-lari"} {
		e.expect(403, "GET", path, token, nil)
	}
	e.expect(403, "POST", "/ai/assistant?tenantId=ten-lari", token, map[string]any{"messages": []map[string]string{{"role": "user", "text": "How are sales?"}}})
	// Their own account stays open to them.
	e.expect(200, "GET", "/auth/me", token, nil)
}

func TestStaffStreamCarriesNoOrders(t *testing.T) {
	e := setup(t)
	made := e.create(e.admin, newStaff("staff@example.com", "staff", "ten-lari"))
	token := e.signIn("staff@example.com", made.TemporaryPassword)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", e.url+"/events", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	lines := bufio.NewScanner(res.Body)
	lines.Buffer(make([]byte, 1<<20), 1<<22)
	lines.Scan() // event: hello
	lines.Scan()

	order := e.orderIn("paid")
	e.expect(200, "POST", "/orders/"+order+"/advance", e.admin, map[string]any{})
	heard := make(chan string, 1)
	go func() {
		for lines.Scan() {
			if line := lines.Text(); strings.HasPrefix(line, "data: ") && strings.Contains(line, order) {
				heard <- line
				return
			}
		}
	}()
	select {
	case line := <-heard:
		t.Fatalf("the staff stream carried an order: %.200s", line)
	case <-time.After(1500 * time.Millisecond):
	}
}
