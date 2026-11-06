package httpapi_test

import (
	"bufio"
	"context"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

const sandboxKey = "SB-Mid-server-test12345678"

// fakeMidtrans stands in for both Midtrans hosts. Every outbound call of the API reaches it through
// a transport that keeps the host the API asked for.
type fakeMidtrans struct {
	mu       sync.Mutex
	snaps    []map[string]any
	hosts    []string
	statusOf map[string]string // order id → transaction_status the status check answers
	grossOf  map[string]string // order id → gross_amount, as Midtrans spells it
	checks   int
}

// answer sets what the status check says about an order.
func (f *fakeMidtrans) answer(o domain.Order, status string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.statusOf[o.ID], f.grossOf[o.ID] = status, fmt.Sprintf("%d.00", o.Total)
}

func (f *fakeMidtrans) checked() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.checks
}

func (f *fakeMidtrans) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.hosts = append(f.hosts, r.Header.Get("X-Asked-Host"))
	if user, pass, ok := r.BasicAuth(); !ok || user != sandboxKey || pass != "" {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	switch {
	case r.Method == "POST" && r.URL.Path == "/snap/v1/transactions":
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		f.snaps = append(f.snaps, body)
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"token":"snap-token-1","redirect_url":"https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token-1"}`))
	case r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/v2/") && strings.HasSuffix(r.URL.Path, "/status"):
		f.checks++
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/v2/"), "/status")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"order_id": id, "status_code": "200", "gross_amount": f.grossOf[id], "transaction_id": "trx-" + id,
			"transaction_status": f.statusOf[id], "fraud_status": "accept",
		})
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

type askedHost struct{ target *url.URL }

func (a askedHost) RoundTrip(r *http.Request) (*http.Response, error) {
	out := r.Clone(r.Context())
	out.Header.Set("X-Asked-Host", r.URL.Host)
	out.URL.Scheme, out.URL.Host, out.Host = a.target.Scheme, a.target.Host, ""
	return http.DefaultTransport.RoundTrip(out)
}

func midtransEnv(t *testing.T) (*env, *fakeMidtrans) {
	t.Helper()
	db := testdb.Open(t)
	if err := seed.Load(t.Context(), db, testdb.SeedDir(t), password); err != nil {
		t.Fatal(err)
	}
	fake := &fakeMidtrans{statusOf: map[string]string{}, grossOf: map[string]string{}}
	mt := httptest.NewServer(fake)
	t.Cleanup(mt.Close)
	target, _ := url.Parse(mt.URL)
	signer, _ := auth.NewSigner(strings.Repeat("s", 32), time.Hour)
	vault, _ := auth.DeriveVault("test")
	srv := httptest.NewServer(httpapi.New(httpapi.Options{
		DB: db, Clock: clock.New(time.Now()), Signer: signer, Vault: vault, Hub: events.New(),
		Outbound:  &http.Client{Transport: askedHost{target}, Timeout: 5 * time.Second},
		PublicURL: "https://shop.example.com", Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test",
	}))
	t.Cleanup(srv.Close)
	e := &env{t: t, url: srv.URL + "/api/v1", db: db, vault: vault}
	e.admin = e.login("andi@lari.co.id")
	e.expect(200, "PUT", "/integrations/int-lari-midtrans/credentials", e.admin,
		map[string]any{"values": map[string]any{"server_key": sandboxKey, "client_key": "SB-Mid-client-test12345678"}})
	return e, fake
}

type placed struct {
	Token   string `json:"token"`
	Payment *struct {
		RedirectURL string `json:"redirectUrl"`
		SnapToken   string `json:"snapToken"`
	} `json:"payment"`
}

// placeWith places a guest order at a store with the payment type the client chose, claiming it
// paid as the storefront does today.
func (e *env) placeWith(store, tenantID, orderID, paymentTypeID, method string) (domain.Order, placed) {
	e.t.Helper()
	var raw []byte
	if err := e.db.Pool.QueryRow(context.Background(), `select data from orders where tenant_id = $1 and data->>'status' = 'completed' limit 1`, tenantID).Scan(&raw); err != nil {
		e.t.Fatal(err)
	}
	var order map[string]any
	if err := json.Unmarshal(raw, &order); err != nil {
		e.t.Fatal(err)
	}
	customerID := "cus-" + orderID
	order["id"], order["customerId"], order["code"] = orderID, customerID, strings.ToUpper(store)+"-9"+orderID[len(orderID)-4:]
	order["status"], order["paymentStatus"], order["paymentMethod"], order["paymentTypeId"] = "paid", "paid", method, paymentTypeID
	order["events"] = []any{
		map[string]any{"id": "oev-paid-" + orderID, "at": order["createdAt"], "by": "storefront", "status": "paid", "note": "Paid"},
		map[string]any{"id": "oev-new-" + orderID, "at": order["createdAt"], "by": "storefront", "status": "new", "note": "Order placed on the storefront"},
	}
	guest := map[string]any{"id": customerID, "tenantId": tenantID, "code": "C-" + orderID, "name": "Guest " + orderID, "email": orderID + "@example.com", "phone": "+62812000"}
	var out placed
	if code := e.call("POST", "/shop/"+store+"/orders", "", map[string]any{"order": order, "customer": guest}, &out); code != 200 {
		e.t.Fatalf("place %s: %d", orderID, code)
	}
	return e.order(orderID), out
}

func (e *env) order(id string) domain.Order {
	e.t.Helper()
	var raw []byte
	if err := e.db.Pool.QueryRow(context.Background(), `select data from orders where id = $1`, id).Scan(&raw); err != nil {
		e.t.Fatal(err)
	}
	var o domain.Order
	if err := json.Unmarshal(raw, &o); err != nil {
		e.t.Fatal(err)
	}
	return o
}

func notification(orderID, status, gross, key string) map[string]string {
	sum := sha512.Sum512([]byte(orderID + "200" + gross + key))
	return map[string]string{
		"order_id": orderID, "status_code": "200", "gross_amount": gross, "transaction_status": status,
		"transaction_id": "trx-" + orderID, "fraud_status": "accept", "signature_key": hex.EncodeToString(sum[:]),
	}
}

func (e *env) notify(o domain.Order, status, key string) int {
	e.t.Helper()
	return e.call("POST", "/payments/midtrans/notification", "", notification(o.ID, status, fmt.Sprintf("%d.00", o.Total), key), nil)
}

func paidSteps(o domain.Order) int {
	n := 0
	for _, ev := range o.Events {
		if ev.Status != nil && *ev.Status == "paid" {
			n++
		}
	}
	return n
}

func TestMidtransOrderIsPlacedPendingWithAPaymentPage(t *testing.T) {
	e, fake := midtransEnv(t)
	o, out := e.placeWith("lari", "ten-lari", "ord-mt-0001", "pay-lari-qris", "qris")
	if o.PaymentStatus != "pending" || o.Status != "confirmed" || paidSteps(o) != 0 {
		t.Errorf("order: status %s, payment %s, paid steps %d", o.Status, o.PaymentStatus, paidSteps(o))
	}
	if out.Payment == nil || out.Payment.RedirectURL == "" || out.Payment.SnapToken != "snap-token-1" {
		t.Fatalf("payment: %+v", out.Payment)
	}
	if len(fake.snaps) != 1 || fake.hosts[0] != "app.sandbox.midtrans.com" {
		t.Fatalf("snap calls %d to %v", len(fake.snaps), fake.hosts)
	}
	snap := fake.snaps[0]
	details := snap["transaction_details"].(map[string]any)
	if details["order_id"] != o.ID || int(details["gross_amount"].(float64)) != o.Total {
		t.Errorf("transaction_details: %v, total %d", details, o.Total)
	}
	sum := 0
	for _, item := range snap["item_details"].([]any) {
		i := item.(map[string]any)
		sum += int(i["price"].(float64)) * int(i["quantity"].(float64))
	}
	if sum != o.Total {
		t.Errorf("items add up to %d, total %d", sum, o.Total)
	}
	if fmt.Sprint(snap["enabled_payments"]) != "[other_qris]" {
		t.Errorf("enabled_payments: %v", snap["enabled_payments"])
	}
	if finish := snap["callbacks"].(map[string]any)["finish"]; finish != "https://shop.example.com/shop/lari/order/"+o.ID {
		t.Errorf("finish: %v", finish)
	}
	// The store tells the checkout which payment types Midtrans collects; a brand without keys has none.
	for store, want := range map[string]bool{"lari": true, "aruna": false} {
		var state struct {
			OnlinePayments []string `json:"onlinePayments"`
		}
		e.call("GET", "/shop/"+store+"/state", "", nil, &state)
		if slices.Contains(state.OnlinePayments, "pay-"+store+"-qris") != want {
			t.Errorf("%s online payments: %v", store, state.OnlinePayments)
		}
	}
	// The shopper's account carries the page, for Pay now.
	var me struct {
		Payments map[string]struct {
			RedirectURL string `json:"redirectUrl"`
		} `json:"payments"`
	}
	e.call("GET", "/shop/lari/me", out.Token, nil, &me)
	if me.Payments[o.ID].RedirectURL != out.Payment.RedirectURL {
		t.Errorf("me payments: %+v", me.Payments)
	}
}

func TestBrandWithoutKeysKeepsTodaysCheckout(t *testing.T) {
	e, fake := midtransEnv(t)
	o, out := e.placeWith("aruna", "ten-aruna", "ord-mt-0002", "pay-aruna-qris", "qris")
	if o.PaymentStatus != "paid" || o.Status != "paid" || out.Payment != nil || len(fake.snaps) != 0 {
		t.Errorf("order %s/%s, payment %+v, snap calls %d", o.Status, o.PaymentStatus, out.Payment, len(fake.snaps))
	}
	// A brand with keys keeps today's behaviour for a provider other than Midtrans.
	o, out = e.placeWith("lari", "ten-lari", "ord-mt-0003", "pay-lari-ovo", "ewallet")
	if o.PaymentStatus != "paid" || out.Payment != nil || len(fake.snaps) != 0 {
		t.Errorf("Xendit order %s, payment %+v", o.PaymentStatus, out.Payment)
	}
}

func TestBadSignatureChangesNothing(t *testing.T) {
	e, fake := midtransEnv(t)
	o, _ := e.placeWith("lari", "ten-lari", "ord-mt-0004", "pay-lari-qris", "qris")
	fake.answer(o, "settlement")
	if code := e.notify(o, "settlement", "SB-Mid-server-wrongkey0000"); code != http.StatusUnauthorized {
		t.Errorf("bad signature: %d", code)
	}
	if after := e.order(o.ID); after.PaymentStatus != "pending" || fake.checked() != 0 {
		t.Errorf("payment %s, status checks %d", after.PaymentStatus, fake.checked())
	}
	var status string
	_ = e.db.Pool.QueryRow(context.Background(), `select status from payments where order_id = $1`, o.ID).Scan(&status)
	if status != "pending" {
		t.Errorf("payment record: %s", status)
	}
}

func TestSettlementPaysOnceAndTheStatusCheckDecides(t *testing.T) {
	e, fake := midtransEnv(t)
	o, _ := e.placeWith("lari", "ten-lari", "ord-mt-0005", "pay-lari-qris", "qris")

	// The body says settlement, Midtrans says pending: nothing moves.
	fake.answer(o, "pending")
	if code := e.notify(o, "settlement", sandboxKey); code != 200 {
		t.Fatalf("notification: %d", code)
	}
	if after := e.order(o.ID); after.PaymentStatus != "pending" || fake.checked() != 1 || fake.hosts[len(fake.hosts)-1] != "api.sandbox.midtrans.com" {
		t.Fatalf("trusted the body: %s, checks %d, host %v", after.PaymentStatus, fake.checks, fake.hosts)
	}

	fake.answer(o, "settlement")
	for range 2 {
		if code := e.notify(o, "settlement", sandboxKey); code != 200 {
			t.Fatalf("notification: %d", code)
		}
	}
	after := e.order(o.ID)
	if after.PaymentStatus != "paid" || after.Status != "paid" || paidSteps(after) != 1 {
		t.Errorf("order %s/%s with %d paid steps", after.Status, after.PaymentStatus, paidSteps(after))
	}
	var payment struct {
		Payment struct {
			Status        string  `json:"status"`
			TransactionID *string `json:"transactionId"`
			NotifiedAt    *string `json:"notifiedAt"`
		} `json:"payment"`
	}
	e.call("GET", "/orders/"+o.ID+"/payment?tenantId=ten-lari", e.admin, nil, &payment)
	if p := payment.Payment; p.Status != "settlement" || p.TransactionID == nil || *p.TransactionID != "trx-"+o.ID || p.NotifiedAt == nil {
		t.Errorf("payment record: %+v", p)
	}
}

func TestExpireCancelsTheOrder(t *testing.T) {
	e, fake := midtransEnv(t)
	o, _ := e.placeWith("lari", "ten-lari", "ord-mt-0006", "pay-lari-va", "va")
	if fmt.Sprint(fake.snaps[0]["enabled_payments"]) != "[bca_va]" {
		t.Errorf("enabled_payments: %v", fake.snaps[0]["enabled_payments"])
	}
	fake.answer(o, "expire")
	if code := e.notify(o, "expire", sandboxKey); code != 200 {
		t.Fatalf("notification: %d", code)
	}
	after := e.order(o.ID)
	if after.Status != "cancelled" || after.PaymentStatus != "failed" || after.CancelReason == nil || *after.CancelReason != "payment_expired" {
		t.Errorf("order %s/%s reason %v", after.Status, after.PaymentStatus, after.CancelReason)
	}
	// A settlement that arrives after the expiry does not reopen the order.
	fake.answer(o, "settlement")
	e.notify(o, "settlement", sandboxKey)
	if again := e.order(o.ID); again.Status != "cancelled" {
		t.Errorf("a late settlement moved a cancelled order to %s", again.Status)
	}
}

func TestShopperStreamCarriesOnlyTheirOwnOrder(t *testing.T) {
	e, fake := midtransEnv(t)
	o, out := e.placeWith("lari", "ten-lari", "ord-mt-0007", "pay-lari-qris", "qris")
	other, _ := e.placeWith("lari", "ten-lari", "ord-mt-0008", "pay-lari-qris", "qris")
	res, err := http.Get(e.url + "/shop/lari/events?token=" + url.QueryEscape(out.Token))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	lines := bufio.NewScanner(res.Body)
	lines.Buffer(make([]byte, 1<<20), 1<<20)
	lines.Scan() // event: hello
	for _, placed := range []domain.Order{other, o} {
		fake.answer(placed, "settlement")
		if code := e.notify(placed, "settlement", sandboxKey); code != 200 {
			t.Fatalf("notification: %d", code)
		}
	}
	for lines.Scan() {
		line := lines.Text()
		if !strings.HasPrefix(line, "data: ") || !strings.Contains(line, `"orders"`) {
			continue
		}
		if strings.Contains(line, other.ID) {
			t.Fatal("the stream carried another shopper's order")
		}
		if strings.Contains(line, o.ID) && strings.Contains(line, `"paymentStatus":"paid"`) {
			return
		}
	}
	t.Fatal("the stream ended without the shopper's paid order")
}
