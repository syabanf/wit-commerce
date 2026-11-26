package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
)

// Brands whose names share a code base and sign up at the same moment still get distinct codes, so
// their order, customer and invoice numbers never collide.
func TestConcurrentSignUpsGetDistinctCodes(t *testing.T) {
	e := setup(t)
	var wg sync.WaitGroup
	for i := range 5 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			body := signUpBody(fmt.Sprintf("kopi-race-%d", i), fmt.Sprintf("race%d@example.com", i))
			body["storeName"] = fmt.Sprintf("Kopirace Toko %d", i)
			raw, _ := json.Marshal(body)
			res, err := http.Post(e.url+"/auth/signup", "application/json", bytes.NewReader(raw))
			if err != nil {
				t.Error(err)
				return
			}
			res.Body.Close()
			if res.StatusCode != 200 {
				t.Errorf("sign-up %d: %d", i, res.StatusCode)
			}
		}()
	}
	wg.Wait()
	rows, err := e.db.Pool.Query(context.Background(), `select data->>'code' from tenants where data->>'subdomain' like 'kopi-race-%'`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	seen := map[string]bool{}
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			t.Fatal(err)
		}
		if seen[code] {
			t.Errorf("two brands share the code %s", code)
		}
		seen[code] = true
	}
	if len(seen) != 5 {
		t.Fatalf("got %d brands, want 5", len(seen))
	}
}

// A shopper can pay only with one of the store's own payment types, switched on, of the method the
// order names and within its amount limits.
func TestShopperOrderPaymentTypeIsChecked(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	var otherBrand string
	if err := e.db.Pool.QueryRow(ctx, `select id from payment_types where tenant_id <> 'ten-lari' limit 1`).Scan(&otherBrand); err != nil {
		t.Fatal(err)
	}
	cases := map[string]func(order map[string]any){
		"another brand's type": func(o map[string]any) { o["paymentTypeId"] = otherBrand },
		"no type":              func(o map[string]any) { o["paymentTypeId"] = nil },
		"wrong method":         func(o map[string]any) { o["paymentMethod"] = "not-a-method" },
	}
	for name, change := range cases {
		order := e.placeable("ord-pay-"+name, "cus-pay")
		change(order)
		status, code, detail := e.placeRefusal(map[string]any{"order": order, "customer": guestFor("cus-pay")})
		if status != http.StatusConflict || code != "PAYMENT_UNAVAILABLE" || detail != rules.PaymentUnavailable {
			t.Errorf("%s: %d %s %q", name, status, code, detail)
		}
	}
	order := e.placeable("ord-pay-limit", "cus-pay")
	if _, err := e.db.Pool.Exec(ctx, `update payment_types set data = jsonb_set(data, '{maxAmount}', '1000') where id = $1`, order["paymentTypeId"]); err != nil {
		t.Fatal(err)
	}
	if status, code, _ := e.placeRefusal(map[string]any{"order": order, "customer": guestFor("cus-pay")}); status != http.StatusConflict || code != "PAYMENT_UNAVAILABLE" {
		t.Errorf("over the type's limit: %d %s", status, code)
	}
	if _, err := e.db.Pool.Exec(ctx, `update payment_types set data = jsonb_set(jsonb_set(data, '{maxAmount}', 'null'), '{enabled}', 'false') where id = $1`, order["paymentTypeId"]); err != nil {
		t.Fatal(err)
	}
	// The terms list the payment types, so switching one off asks for a fresh agreement first.
	order["termsVersion"] = e.termsVersion("ten-lari")
	if status, code, _ := e.placeRefusal(map[string]any{"order": order, "customer": guestFor("cus-pay")}); status != http.StatusConflict || code != "PAYMENT_UNAVAILABLE" {
		t.Errorf("switched-off type: %d %s", status, code)
	}
}

// A product names only its own brand's category, and a save straight to active passes the same check
// as switching the status.
func TestProductSaveKeepsCatalogIntegrity(t *testing.T) {
	e := setup(t)
	var raw []byte
	if err := e.db.Pool.QueryRow(context.Background(), `select data from products where tenant_id = 'ten-lari' and status = 'active' limit 1`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var product map[string]any
	if err := json.Unmarshal(raw, &product); err != nil {
		t.Fatal(err)
	}
	var foreign string
	if err := e.db.Pool.QueryRow(context.Background(), `select id from categories where tenant_id <> 'ten-lari' limit 1`).Scan(&foreign); err != nil {
		t.Fatal(err)
	}
	stolen := clone(product)
	stolen["categoryId"] = foreign
	e.expect(422, "PUT", fmt.Sprintf("/products/%s", product["id"]), e.admin, stolen)

	bare := clone(product)
	bare["id"], bare["code"], bare["status"], bare["variants"], bare["price"] = "prd-bare", "BARE-1", "active", []any{}, 0
	e.expect(409, "PUT", "/products/prd-bare", e.admin, bare)
	bare["status"] = "draft"
	e.expect(200, "PUT", "/products/prd-bare", e.admin, bare)
}

func clone(m map[string]any) map[string]any {
	raw, _ := json.Marshal(m)
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	return out
}
