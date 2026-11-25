package httpapi_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

const shopPassword = "correct horse battery"

func TestGuestCannotTakeOverACustomerByNamingTheirID(t *testing.T) {
	e := setup(t)
	victim := "cus-lari-0399"
	in := map[string]any{
		"order":    map[string]any{"id": "ord-attack", "tenantId": "ten-lari", "customerId": victim, "lines": []any{}},
		"customer": map[string]any{"id": victim, "tenantId": "ten-lari", "name": "Attacker"},
	}
	var out struct {
		Token string `json:"token"`
	}
	if code := e.call("POST", "/shop/lari/orders", "", in, &out); code != http.StatusConflict {
		t.Errorf("status %d, want 409", code)
	}
	if out.Token != "" {
		t.Error("a guest received a token for an existing customer")
	}
}

func TestShopperRegistersSignsInAndChangesPassword(t *testing.T) {
	e := setup(t)
	reg := map[string]string{"name": "Rina", "email": "Rina@Example.com ", "phone": "+62812", "password": shopPassword}
	var created struct {
		Token    string          `json:"token"`
		Customer domain.Customer `json:"customer"`
	}
	if code := e.call("POST", "/shop/lari/register", "", reg, &created); code != 200 {
		t.Fatalf("register: %d", code)
	}
	if created.Customer.Email != "rina@example.com" || !strings.HasPrefix(created.Customer.Code, "LARI-C") {
		t.Errorf("customer: %+v", created.Customer)
	}
	e.expect(409, "POST", "/shop/lari/register", "", reg)
	// The account belongs to one store.
	e.expect(401, "POST", "/shop/aruna/login", "", map[string]string{"email": "rina@example.com", "password": shopPassword})
	e.expect(401, "POST", "/shop/lari/login", "", map[string]string{"email": "rina@example.com", "password": "wrong password"})
	e.expect(200, "POST", "/shop/lari/login", "", map[string]string{"email": "RINA@example.com", "password": shopPassword})

	var me struct {
		HasPassword bool `json:"hasPassword"`
	}
	e.call("GET", "/shop/lari/me", created.Token, nil, &me)
	if !me.HasPassword {
		t.Error("hasPassword is false after registering")
	}
	e.expect(401, "POST", "/shop/lari/password", created.Token, map[string]string{"newPassword": "another long password"})
	e.expect(422, "POST", "/shop/lari/password", created.Token, map[string]string{"currentPassword": shopPassword, "newPassword": "short"})
	e.expect(200, "POST", "/shop/lari/password", created.Token, map[string]string{"currentPassword": shopPassword, "newPassword": "another long password"})
	e.expect(200, "POST", "/shop/lari/login", "", map[string]string{"email": "rina@example.com", "password": "another long password"})
}

func TestRegisteringGivesNoAccessToAGuestsOrders(t *testing.T) {
	e := setup(t)
	email := "guest-orders@example.com"
	guest := map[string]any{"id": "cus-guest", "tenantId": "ten-lari", "code": "LARI-C99999", "name": "Guest", "email": email}
	var placed struct {
		Token string `json:"token"`
	}
	order := e.placeable("ord-guest", "cus-guest")
	if code := e.call("POST", "/shop/lari/orders", "", map[string]any{"order": order, "customer": guest}, &placed); code != 200 {
		t.Fatalf("guest order: %d", code)
	}
	var created struct {
		Token string `json:"token"`
	}
	e.call("POST", "/shop/lari/register", "", map[string]string{"name": "Someone Else", "email": email, "password": shopPassword}, &created)
	var me struct {
		Orders []domain.Order `json:"orders"`
	}
	e.call("GET", "/shop/lari/me", created.Token, nil, &me)
	if len(me.Orders) != 0 {
		t.Errorf("registering with a guest's email exposed %d orders", len(me.Orders))
	}
	// The guest's own record cannot take a password once the email has an account.
	e.expect(409, "POST", "/shop/lari/password", placed.Token, map[string]string{"newPassword": "another long password"})
}

func TestUserChangesPassword(t *testing.T) {
	e := setup(t)
	token := e.login("maya@lari.co.id")
	e.expect(401, "POST", "/auth/password", "", map[string]string{"currentPassword": password, "newPassword": "another long password"})
	e.expect(401, "POST", "/auth/password", token, map[string]string{"currentPassword": "nope", "newPassword": "another long password"})
	e.expect(422, "POST", "/auth/password", token, map[string]string{"currentPassword": password, "newPassword": "short"})
	var changed struct {
		Token string `json:"token"`
	}
	future := time.Now().Add(2 * time.Second)
	time.Sleep(time.Until(future.Truncate(time.Second)))
	if code := e.call("POST", "/auth/password", token, map[string]string{"currentPassword": password, "newPassword": "another long password"}, &changed); code != 200 {
		t.Fatalf("change: %d", code)
	}
	e.expect(401, "GET", "/auth/me", token, nil)
	e.expect(200, "GET", "/auth/me", changed.Token, nil)
	e.expect(401, "POST", "/auth/login", "", map[string]string{"email": "maya@lari.co.id", "password": password})
	e.expect(200, "POST", "/auth/login", "", map[string]string{"email": "maya@lari.co.id", "password": "another long password"})
}

func TestSignInAttemptsAreCapped(t *testing.T) {
	e := setup(t)
	limited := false
	for range signInEmailCap + 2 {
		if e.call("POST", "/auth/login", "", map[string]string{"email": "andi@lari.co.id", "password": "wrong"}, nil) == http.StatusTooManyRequests {
			limited = true
		}
	}
	if !limited {
		t.Error("the limit never applied")
	}
}

const signInEmailCap = 10

// placeable copies a seeded order into a new one a guest can place.
func (e *env) placeable(id, customerID string) map[string]any {
	e.t.Helper()
	var raw []byte
	if err := e.db.Pool.QueryRow(context.Background(), `select data from orders where tenant_id = 'ten-lari' and data->>'status' = 'completed' limit 1`).Scan(&raw); err != nil {
		e.t.Fatal(err)
	}
	var order map[string]any
	if err := json.Unmarshal(raw, &order); err != nil {
		e.t.Fatal(err)
	}
	order["id"], order["customerId"], order["code"], order["status"] = id, customerID, "LARI-99999", "new"
	order["termsVersion"] = e.termsVersion("ten-lari")
	return order
}

// The storefront never holds the brand's customers, so every guest proposes the first customer code.
// The first guest keeps it; the server gives the next one the next free code instead of failing on
// the unique index.
func TestGuestCheckoutsGetFreeCustomerCodes(t *testing.T) {
	e := setup(t)
	codes := map[string]bool{}
	for i, id := range []string{"cus-guest-a", "cus-guest-b"} {
		guest := map[string]any{"id": id, "tenantId": "ten-lari", "code": "LARI-C00001", "name": "Guest", "email": id + "@example.com"}
		order := e.placeable(fmt.Sprintf("ord-guest-%d", i), id)
		if code := e.call("POST", "/shop/lari/orders", "", map[string]any{"order": order, "customer": guest}, nil); code != 200 {
			t.Fatalf("guest %s: %d", id, code)
		}
		var got string
		if err := e.db.Pool.QueryRow(context.Background(), `select code from customers where id = $1`, id).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if codes[got] {
			t.Fatalf("guest %s took the code %s another customer holds", id, got)
		}
		codes[got] = true
	}
}

// Guests checking out at the same moment all get their order: each takes its own order and customer
// code instead of one of them failing on the unique index.
func TestConcurrentGuestCheckoutsAllSucceed(t *testing.T) {
	e := setup(t)
	const n = 8
	bodies := make([]map[string]any, n)
	for i := range n {
		id := fmt.Sprintf("cus-rush-%d", i)
		guest := map[string]any{"id": id, "tenantId": "ten-lari", "code": "LARI-C00001", "name": "Rush", "email": id + "@example.com"}
		bodies[i] = map[string]any{"order": e.placeable(fmt.Sprintf("ord-rush-%d", i), id), "customer": guest}
	}
	var wg sync.WaitGroup
	codes := make([]int, n)
	for i := range n {
		wg.Go(func() { codes[i] = e.call("POST", "/shop/lari/orders", "", bodies[i], nil) })
	}
	wg.Wait()
	for i, code := range codes {
		if code != 200 {
			t.Errorf("checkout %d: %d", i, code)
		}
	}
	var orders, customers int
	if err := e.db.Pool.QueryRow(context.Background(), `select count(distinct o.code), count(distinct c.code) from orders o
		join customers c on c.id = o.customer_id where o.id like 'ord-rush-%'`).Scan(&orders, &customers); err != nil {
		t.Fatal(err)
	}
	if orders != n || customers != n {
		t.Errorf("%d order codes and %d customer codes for %d checkouts", orders, customers, n)
	}
}

// The 24-hour payment window starts on the server's clock: an order whose browser claims it was
// placed days ago is stored with the time the API took it.
func TestShopperOrdersTakeTheServerTime(t *testing.T) {
	e := setup(t)
	guest := map[string]any{"id": "cus-guest-time", "tenantId": "ten-lari", "code": "LARI-C00001", "name": "Guest", "email": "guest-time@example.com"}
	order := e.placeable("ord-guest-time", "cus-guest-time")
	order["createdAt"] = "2020-01-01T00:00:00+07:00"
	if code := e.call("POST", "/shop/lari/orders", "", map[string]any{"order": order, "customer": guest}, nil); code != 200 {
		t.Fatalf("guest order: %d", code)
	}
	var created string
	if err := e.db.Pool.QueryRow(context.Background(), `select data->>'createdAt' from orders where id = 'ord-guest-time'`).Scan(&created); err != nil {
		t.Fatal(err)
	}
	if strings.HasPrefix(created, "2020") {
		t.Fatalf("the order kept the browser's time %s", created)
	}
}
