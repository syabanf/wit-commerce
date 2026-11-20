package httpapi_test

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

func (e *env) planImport(csv string, mapping map[string]string) service.ProductImport {
	e.t.Helper()
	var out service.ProductImport
	in := service.ProductImportInput{TenantID: "ten-lari", FileName: "products.csv", CSV: csv, Mapping: mapping}
	if code := e.call("POST", "/product-imports", e.admin, in, &out); code != 200 {
		e.t.Fatalf("plan import: %d", code)
	}
	return out
}

func (e *env) applyImport(id string, batch int) service.ProductImport {
	e.t.Helper()
	var out service.ProductImport
	if code := e.call("POST", "/product-imports/"+id+"/apply", e.admin, map[string]int{"batch": batch}, &out); code != 200 {
		e.t.Fatalf("apply import: %d", code)
	}
	return out
}

// tenantProducts reads every lari product row as stored, by id.
func (e *env) tenantProducts() map[string]string {
	e.t.Helper()
	rows, err := e.db.Pool.Query(context.Background(), `select id, data::text from products where tenant_id = 'ten-lari'`)
	if err != nil {
		e.t.Fatal(err)
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var id, data string
		if err := rows.Scan(&id, &data); err != nil {
			e.t.Fatal(err)
		}
		out[id] = data
	}
	return out
}

func TestProductCSVRoundTripChangesNothing(t *testing.T) {
	e := setup(t)
	before := e.tenantProducts()
	csv := e.download("/products/export.csv?tenantId=ten-lari&delimiter=semicolon")
	if !strings.HasPrefix(csv, "\ufeffhandle;name;") || !strings.Contains(csv, "stock:CKR") {
		t.Fatalf("export header: %.200s", csv)
	}
	plan := e.planImport(csv, nil)
	if len(plan.Issues) != 0 || plan.Plan.Create+plan.Plan.Update != 0 || plan.Plan.Unchanged != len(before) {
		t.Fatalf("plan %+v issues %+v", plan.Plan, plan.Issues)
	}
	done := e.applyImport(plan.ID, 0)
	if done.Status != "done" || done.Created+done.Updated+done.Skipped != 0 || done.Unchanged != len(before) {
		t.Fatalf("apply %+v", done)
	}
	after := e.tenantProducts()
	for id, data := range before {
		if after[id] != data {
			t.Errorf("%s changed:\n%s\n%s", id, data, after[id])
		}
	}
	if n := e.auditCount("true"); n != 0 {
		t.Errorf("an import that changed nothing left %d audit rows", n)
	}
}

func TestProductImportReportsEveryBadRow(t *testing.T) {
	e := setup(t)
	csv := "\ufeffHandle,Name,category,price,sku,option1_name,option1_value,stock:ckr\r\n" +
		"NEW-1,Fresh tee,Apparel,150000,NEW-1-M,Size,M,4\r\n" +
		"NEW-1,Fresh tee,Apparel,150000,NEW-1-L,Size,L,\r\n" +
		"NEW-2,Odd tee,Hats,150000,NEW-2-M,,,\r\n" +
		"NEW-3,Cheap tee,Apparel,15.000,NEW-3-M,,,\r\n" +
		"NEW-4,Twin tee,Apparel,90000,NEW-1-M,,,\r\n" +
		"NEW-5,,Apparel,90000,NEW-5-M,,,\r\n" +
		"NEW-6,Thief tee,Apparel,90000,LR-101-39-VOL,,,\r\n" +
		",Lost tee,Apparel,90000,NEW-7-M,,,\r\n"
	plan := e.planImport(csv, map[string]string{"Handle": "handle", "Name": "name"})
	if plan.Rows != 8 || plan.Plan.Create != 1 || plan.Plan.Invalid != 5 || plan.Total != 1 {
		t.Fatalf("plan %+v total %d rows %d", plan.Plan, plan.Total, plan.Rows)
	}
	want := map[int]string{4: "category", 5: "price", 6: "sku", 7: "name", 8: "sku", 9: "handle"}
	got := map[int]string{}
	for _, is := range plan.Issues {
		got[is.Line] = is.Column
	}
	for line, column := range want {
		if got[line] != column {
			t.Errorf("line %d: got column %q, want %q (issues %+v)", line, got[line], column, plan.Issues)
		}
	}
	done := e.applyImport(plan.ID, 0)
	if done.Created != 1 || done.Status != "done" {
		t.Fatalf("apply %+v", done)
	}
	var onHand int
	var note string
	if err := e.db.Pool.QueryRow(context.Background(), `select (s.data->>'onHand')::int, m.data->>'note' from stock s
		join stock_moves m on m.data->>'variantId' = s.data->>'variantId'
		join products p on p.id = s.data->>'productId' where p.data->>'code' = 'NEW-1' and s.data->>'warehouseId' = 'wh-lari-ckr'`).Scan(&onHand, &note); err != nil || onHand != 4 || note != "CSV import" {
		t.Errorf("stock %d %q %v", onHand, note, err)
	}
	// A product whose stock alone changed still finds the import in its history.
	stockOnly := "handle,sku,stock:CKR\nLR-101,LR-101-39-VOL,99\n"
	e.applyImport(e.planImport(stockOnly, nil).ID, 0)
	if h := e.auditPage(e.admin, "&collection=products&entityId=prd-lr-101").Entries; len(h) != 1 || h[0].Action != "products/import" {
		t.Errorf("product history %+v", h)
	}
	page := e.auditPage(e.admin, "&action=products/import&collection=products&entityId="+e.first(`select id from products where data->>'code' = 'NEW-1'`))
	if len(page.Entries) != 1 || page.Entries[0].EntityCollection != "products" {
		t.Fatalf("import audit rows %+v", page.Entries)
	}
}

func TestProductImportAppliesInBatchesAndResumes(t *testing.T) {
	e := setup(t)
	var b strings.Builder
	b.WriteString("handle;name;category;price;sku;description\n")
	for i := range 250 {
		fmt.Fprintf(&b, "BULK-%03d;Bulk %d;Accessories;%d;BULK-%03d-OS;\"Line one; still one\nline two\"\n", i, i, 10000+i, i)
	}
	plan := e.planImport(b.String(), nil)
	if plan.Total != 250 || plan.Plan.Create != 250 || len(plan.Issues) != 0 {
		t.Fatalf("plan %+v %+v", plan.Plan, plan.Issues)
	}
	first := e.applyImport(plan.ID, 0)
	if first.Status != "applying" || first.Next != 100 || first.Created != 100 {
		t.Fatalf("first batch %+v", first)
	}
	// The import carries on from where it stopped, read back from the server.
	var status service.ProductImport
	e.call("GET", "/product-imports/"+plan.ID, e.admin, nil, &status)
	if status.Next != 100 {
		t.Fatalf("status %+v", status)
	}
	e.applyImport(plan.ID, 0)
	last := e.applyImport(plan.ID, 0)
	if last.Status != "done" || last.Created != 250 {
		t.Fatalf("last batch %+v", last)
	}
	if again := e.applyImport(plan.ID, 0); again.Created != 250 {
		t.Errorf("a finished import ran again: %+v", again)
	}
	if n := e.auditCount("action = 'products/import'"); n != 250 {
		t.Errorf("%d audit rows, want one per product", n)
	}
	p := e.product(e.first(`select id from products where data->>'code' = 'BULK-007'`))
	if p.Description != "Line one; still one\nline two" || p.Price != 10007 || p.Variants[0].Name != "Standard" {
		t.Errorf("product %+v", p)
	}
	maya := e.login("maya@lari.co.id")
	e.expect(403, "POST", "/product-imports", maya, service.ProductImportInput{TenantID: "ten-lari", CSV: "handle,sku\n"})
}
