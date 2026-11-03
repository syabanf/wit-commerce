package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

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
	e.expect(204, "POST", "/shop/lari/password", created.Token, map[string]string{"currentPassword": shopPassword, "newPassword": "another long password"})
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
	e.expect(204, "POST", "/auth/password", token, map[string]string{"currentPassword": password, "newPassword": "another long password"})
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
	return order
}
