package httpapi_test

import (
	"bytes"
	"encoding/json"
	"testing"
)

// What a brand pays for a product is for staff only: the store dataset and search never carry it,
// while the console still does.
func TestShoppersNeverSeeProductCost(t *testing.T) {
	e := setup(t)
	for _, path := range []string{"/shop/lari/state", "/shop/lari/search?q=sepatu", "/shop/lari/search?pageSize=60"} {
		res, body := get(t, e.url+path)
		if res.StatusCode != 200 {
			t.Fatalf("%s: %d", path, res.StatusCode)
		}
		if !bytes.Contains(body, []byte(`"price"`)) {
			t.Fatalf("%s carried no products", path)
		}
		if bytes.Contains(body, []byte(`"cost"`)) {
			t.Errorf("%s carried a product cost", path)
		}
	}
	var state struct {
		State struct {
			Products []map[string]any `json:"products"`
		} `json:"state"`
	}
	if code := e.call("GET", "/state", e.admin, nil, &state); code != 200 || len(state.State.Products) == 0 {
		t.Fatalf("console state: %d", code)
	}
	if _, ok := state.State.Products[0]["cost"]; !ok {
		t.Fatal("the console lost the product cost")
	}
}

// A brand's voucher codes stay out of the public dataset; a shopper who types one gets its
// promotion. Automatic and seller promotions stay public, and no promotion shows its revenue.
func TestBrandVoucherCodesStaySecretUntilTyped(t *testing.T) {
	e := setup(t)
	res, body := get(t, e.url+"/shop/lari/state")
	if res.StatusCode != 200 {
		t.Fatalf("state: %d", res.StatusCode)
	}
	var shop struct {
		State struct {
			Promotions []json.RawMessage `json:"promotions"`
		} `json:"state"`
	}
	if err := json.Unmarshal(body, &shop); err != nil {
		t.Fatal(err)
	}
	promotions, _ := json.Marshal(shop.State.Promotions)
	for _, secret := range []string{"RUNMONTH15", "WELCOME10", "VIPFIRST", `"revenue"`} {
		if bytes.Contains(promotions, []byte(secret)) {
			t.Errorf("the store's promotions carried %s", secret)
		}
	}
	for _, public := range []string{"FREESHIP", "FAHMI10"} {
		if !bytes.Contains(promotions, []byte(public)) {
			t.Errorf("the store's promotions lost %s", public)
		}
	}
	res, body = get(t, e.url+"/shop/lari/vouchers/runmonth15")
	if res.StatusCode != 200 || !bytes.Contains(body, []byte("RUNMONTH15")) || bytes.Contains(body, []byte(`"revenue"`)) {
		t.Fatalf("typed code: %d %s", res.StatusCode, body)
	}
	for _, code := range []string{"NOPE", "PAYDAY100"} {
		if res, _ := get(t, e.url+"/shop/lari/vouchers/"+code); res.StatusCode != 404 {
			t.Errorf("%s answered %d, want 404", code, res.StatusCode)
		}
	}
	if res, _ := get(t, e.url+"/shop/aruna/vouchers/RUNMONTH15"); res.StatusCode != 404 {
		t.Errorf("another store opened Lari's code: %d", res.StatusCode)
	}
}
