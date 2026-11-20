package httpapi_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

func (e *env) product(id string) domain.Product {
	e.t.Helper()
	var raw []byte
	if err := e.db.Pool.QueryRow(context.Background(), `select data from products where id = $1`, id).Scan(&raw); err != nil {
		e.t.Fatal(err)
	}
	var p domain.Product
	if err := json.Unmarshal(raw, &p); err != nil {
		e.t.Fatal(err)
	}
	return p
}

func (e *env) auditCount(where string, args ...any) int {
	e.t.Helper()
	var n int
	if err := e.db.Pool.QueryRow(context.Background(), `select count(*) from audit_log where `+where, args...).Scan(&n); err != nil {
		e.t.Fatal(err)
	}
	return n
}

func (e *env) auditPage(token, query string) httpapi.AuditPage {
	e.t.Helper()
	var page httpapi.AuditPage
	if code := e.call("GET", "/audit-log?tenantId=ten-lari"+query, token, nil, &page); code != 200 {
		e.t.Fatalf("GET /audit-log%s: %d", query, code)
	}
	return page
}

func TestStaffWriteRecordsOneAuditRowWithItsDiff(t *testing.T) {
	e := setup(t)
	p := e.product("prd-lr-101")
	old := p.Price
	p.Price = old + 1000
	e.expect(200, "PUT", "/products/"+p.ID, e.admin, p)

	page := e.auditPage(e.admin, "")
	if len(page.Entries) != 1 {
		t.Fatalf("want one audit row, got %d", len(page.Entries))
	}
	a := page.Entries[0]
	if a.Action != "products/save" || a.ActorKind != "user" || a.ActorID != "usr-andi" || a.ActorName != "Andi Pratama" ||
		a.EntityCollection != "products" || len(a.EntityIDs) != 1 || a.EntityIDs[0] != p.ID || a.TenantID != "ten-lari" {
		t.Fatalf("audit row %+v", a)
	}
	if a.RequestID == "" || !strings.HasSuffix(a.IP, "/24") {
		t.Errorf("request id %q and truncated ip %q", a.RequestID, a.IP)
	}
	changes := a.Changes
	if len(changes) != 1 || changes[0].Op != "update" || len(changes[0].Fields) != 1 {
		t.Fatalf("changes %+v", changes)
	}
	price, _ := changes[0].Fields["price"].(map[string]any)
	if price["before"] != float64(old) || price["after"] != float64(old+1000) {
		t.Errorf("price diff %+v", price)
	}

	// Saving the same product again changes nothing and records nothing.
	e.expect(200, "PUT", "/products/"+p.ID, e.admin, p)
	if n := e.auditCount("true"); n != 1 {
		t.Errorf("a save that changed nothing added a row: %d rows", n)
	}
}

func TestAuditRedactsPersonalData(t *testing.T) {
	e := setup(t)
	var raw []byte
	if err := e.db.Pool.QueryRow(context.Background(), `select data from customers where id = 'cus-lari-0001'`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var c map[string]any
	_ = json.Unmarshal(raw, &c)
	c["email"], c["phone"], c["name"], c["stage"] = "secret.person@example.com", "+6281299990000", "Secret Person", "lead"
	e.expect(200, "PUT", "/customers/cus-lari-0001", e.admin, c)
	e.expect(200, "POST", "/customers/cus-lari-0001/erase", e.admin, map[string]string{"note": "Asked by email"})

	page := e.auditPage(e.admin, "&collection=customers&entityId=cus-lari-0001")
	if len(page.Entries) != 2 || page.Entries[0].Action != "customers/erase" || page.Entries[1].Action != "customers/save" {
		t.Fatalf("history %+v", page.Entries)
	}
	for _, entry := range page.Entries {
		raw, _ := json.Marshal(entry.Changes)
		body := string(raw)
		for _, leak := range []string{"secret.person", "+6281299990000", "Secret Person"} {
			if strings.Contains(body, leak) {
				t.Errorf("%s stored %q: %s", entry.Action, leak, body)
			}
		}
	}
	save := page.Entries[1].Changes[0]
	for _, f := range []string{"email", "phone", "name"} {
		if save.Fields[f] != "changed" {
			t.Errorf("%s is %v, want \"changed\"", f, save.Fields[f])
		}
	}
	if stage, _ := save.Fields["stage"].(map[string]any); stage["after"] != "lead" {
		t.Errorf("stage %v should keep its values", save.Fields["stage"])
	}
}

func TestAPIKeyWritesAreAuditedAndShopperWritesAreNot(t *testing.T) {
	e := setup(t)
	key := e.issue("catalog:write")
	p := e.product("prd-lr-102")
	p.Description = "Rewritten by the ERP"
	e.expect(200, "PUT", "/products/"+p.ID, key.Secret, p)
	a := e.auditPage(e.admin, "").Entries
	if len(a) != 1 || a[0].ActorKind != "api_key" || a[0].APIKeyID == "" || a[0].ActorID != a[0].APIKeyID || a[0].ActorName != "ERP sync" {
		t.Fatalf("api key row %+v", a)
	}

	reg := map[string]string{"name": "Rina", "email": "rina.audit@example.com", "phone": "+62812", "password": shopPassword}
	e.expect(200, "POST", "/shop/lari/register", "", reg)
	if n := e.auditCount("true"); n != 1 {
		t.Errorf("a shopper registration was audited: %d rows", n)
	}
}

func TestAuditLogIsAppendOnly(t *testing.T) {
	e := setup(t)
	p := e.product("prd-lr-101")
	p.Price++
	e.expect(200, "PUT", "/products/"+p.ID, e.admin, p)
	id := e.auditPage(e.admin, "").Entries[0].ID
	for _, method := range []string{"PUT", "DELETE", "POST"} {
		if code := e.call(method, "/audit-log/"+id, e.admin, map[string]any{}, nil); code != 404 && code != 405 {
			t.Errorf("%s /audit-log/%s answered %d", method, id, code)
		}
	}
	ctx := context.Background()
	if _, err := e.db.Pool.Exec(ctx, `update audit_log set action = 'forged'`); err == nil {
		t.Error("an update went through")
	}
	if _, err := e.db.Pool.Exec(ctx, `delete from audit_log`); err == nil {
		t.Error("a delete went through")
	}
	// The retention prune may delete rows past the period, and nothing newer.
	svc := service.New(kernel.Runtime{DB: e.db, Clock: clock.New(time.Now())})
	r := service.DefaultRetention()
	deleted, err := svc.Prune(ctx, time.Now().Add(6*365*24*time.Hour), time.Now(), r)
	if err != nil || deleted["audit_log"] != 1 {
		t.Fatalf("prune after six years: %v %v", deleted, err)
	}
}

func TestAuditLogPagesByKeysetAndExportsCSV(t *testing.T) {
	e := setup(t)
	p := e.product("prd-lr-101")
	for range 5 {
		p.Price++
		e.expect(200, "PUT", "/products/"+p.ID, e.admin, p)
	}
	seen := map[string]bool{}
	before := ""
	for pages := 0; ; pages++ {
		q := "&limit=2"
		if before != "" {
			q += "&before=" + before
		}
		page := e.auditPage(e.admin, q)
		for _, a := range page.Entries {
			if seen[a.ID] {
				t.Fatalf("row %s on two pages", a.ID)
			}
			seen[a.ID] = true
		}
		if page.NextBefore == "" {
			if pages != 2 || len(seen) != 5 {
				t.Fatalf("%d pages, %d rows", pages+1, len(seen))
			}
			break
		}
		before = page.NextBefore
	}
	if got := e.auditPage(e.admin, "&action=products/").Entries; len(got) != 5 {
		t.Errorf("action prefix filter found %d", len(got))
	}
	if got := e.auditPage(e.admin, "&actorId=usr-maya").Entries; len(got) != 0 {
		t.Errorf("actor filter found %d", len(got))
	}
	maya := e.login("maya@lari.co.id")
	e.expect(403, "GET", "/audit-log?tenantId=ten-lari", maya, nil)

	body := e.download("/audit-log/export.csv?tenantId=ten-lari&delimiter=semicolon")
	if !strings.HasPrefix(body, "\ufeffid;at;actor_kind") || strings.Count(body, "products/save") != 5 {
		t.Errorf("export:\n%s", body)
	}
}

// download reads a CSV route as the admin.
func (e *env) download(path string) string {
	e.t.Helper()
	req, _ := http.NewRequest("GET", e.url+path, nil)
	req.Header.Set("Authorization", "Bearer "+e.admin)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode != 200 || !strings.HasPrefix(res.Header.Get("Content-Type"), "text/csv") {
		e.t.Fatalf("GET %s: %d %s", path, res.StatusCode, raw)
	}
	return string(raw)
}
