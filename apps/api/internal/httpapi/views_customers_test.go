package httpapi_test

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/readmodel"
)

type customerPage struct {
	Rows []struct {
		Customer domain.Customer `json:"customer"`
		Metrics  *metricRow      `json:"metrics"`
	} `json:"rows"`
	Total       int            `json:"total"`
	StageCounts map[string]int `json:"stageCounts"`
	TierCounts  map[string]int `json:"tierCounts"`
}

func (e *env) customerRows(token string, params url.Values) customerPage {
	e.t.Helper()
	var out customerPage
	if params.Get("tenantId") == "" {
		params.Set("tenantId", "ten-lari")
	}
	if code := e.call("GET", "/views/customers?"+params.Encode(), token, nil, &out); code != 200 {
		e.t.Fatalf("customers %s: %d", params.Encode(), code)
	}
	return out
}

func TestStateLeavesCustomersToTheViews(t *testing.T) {
	e := setup(t)
	var state struct {
		State map[string][]json.RawMessage `json:"state"`
	}
	e.call("GET", "/state", e.admin, nil, &state)
	if n := len(state.State["customers"]) + len(state.State["customerMetrics"]); n != 0 {
		t.Errorf("the admin's state still carries %d customer and metric rows", n)
	}
	if _, ok := state.State["customers"]; !ok {
		t.Error("the state lost the customers key, which the console merges over")
	}

	// A sales user keeps the customers assigned to them, which the seller app lists.
	fahmi := e.login("fahmi@lari.co.id")
	var mine struct {
		State struct {
			Customers []domain.Customer `json:"customers"`
		} `json:"state"`
	}
	e.call("GET", "/state", fahmi, nil, &mine)
	assigned := e.ids(`select id from customers where data->>'sellerId' = 'sel-fahmi'`)
	if len(mine.State.Customers) != len(assigned) {
		t.Errorf("sales state: %d customers, %d assigned", len(mine.State.Customers), len(assigned))
	}
	for _, c := range mine.State.Customers {
		if !assigned[c.ID] {
			t.Fatalf("sales state carried %s, who is not assigned to them", c.ID)
		}
	}
}

func TestCustomerRowsFilterSearchAndPage(t *testing.T) {
	e := setup(t)
	var count int
	_ = e.db.Pool.QueryRow(context.Background(), `select count(*) from customers where tenant_id = 'ten-lari'`).Scan(&count)
	all := e.customerRows(e.admin, url.Values{"pageSize": {"500"}})
	if all.Total != count || len(all.Rows) != min(count, 500) {
		t.Fatalf("total %d rows %d, brand holds %d", all.Total, len(all.Rows), count)
	}
	sum := 0
	for _, n := range all.StageCounts {
		sum += n
	}
	if sum != count {
		t.Errorf("stage counts add to %d, not %d", sum, count)
	}
	// Spend, highest first, is the default order; metrics travel with their customer.
	metrics := e.metrics("ten-lari")
	for i, r := range all.Rows {
		want := metrics[r.Customer.ID]
		if (r.Metrics == nil) != (want.CustomerID == "") || (r.Metrics != nil && r.Metrics.Spend != want.Spend) {
			t.Fatalf("%s carries metrics %+v, the read model %+v", r.Customer.ID, r.Metrics, want)
		}
		if i > 0 && spendOf(all.Rows[i-1].Metrics) < spendOf(r.Metrics) {
			t.Fatalf("row %d spends more than the row before it", i)
		}
	}

	target := all.Rows[3].Customer
	byID := e.customerRows(e.admin, url.Values{"ids": {target.ID + ",cus-none"}})
	if byID.Total != 1 || byID.Rows[0].Customer.ID != target.ID {
		t.Fatalf("ids lookup: %+v", byID)
	}
	if got := e.customerRows(e.admin, url.Values{"q": {strings.ToLower(target.Code)}}); got.Total != 1 {
		t.Errorf("search by code found %d", got.Total)
	}
	if target.Email != "" {
		if got := e.customerRows(e.admin, url.Values{"email": {strings.ToUpper(target.Email)}}); got.Total < 1 || got.Rows[0].Customer.Email != target.Email {
			t.Errorf("email lookup: %+v", got)
		}
	}
	if target.Phone != "" {
		spaced := strings.Join(strings.Split(strings.ReplaceAll(target.Phone, " ", ""), ""), " ")
		if got := e.customerRows(e.admin, url.Values{"phone": {spaced}}); got.Total < 1 {
			t.Errorf("phone lookup with other spacing found nothing")
		}
	}
	stage := e.customerRows(e.admin, url.Values{"stage": {target.Stage}, "pageSize": {"500"}})
	if stage.Total != all.StageCounts[target.Stage] {
		t.Errorf("stage %s: %d rows, chip said %d", target.Stage, stage.Total, all.StageCounts[target.Stage])
	}
	for _, r := range stage.Rows {
		if r.Customer.Stage != target.Stage {
			t.Fatalf("stage filter let %s through", r.Customer.Stage)
		}
	}
	page2 := e.customerRows(e.admin, url.Values{"sort": {"customer"}, "page": {"1"}, "pageSize": {"5"}})
	page1 := e.customerRows(e.admin, url.Values{"sort": {"customer"}, "pageSize": {"5"}})
	if len(page2.Rows) != 5 || page1.Rows[4].Customer.Name > page2.Rows[0].Customer.Name {
		t.Errorf("name pages overlap or run out of order")
	}
	repeat := e.customerRows(e.admin, url.Values{"view": {"repeat"}, "pageSize": {"500"}})
	for _, r := range repeat.Rows {
		if r.Metrics == nil || r.Metrics.Orders < 2 {
			t.Fatalf("repeat view let %s through", r.Customer.ID)
		}
	}

	e.expect(403, "GET", "/views/customers?tenantId=ten-teknika", e.admin, nil)
	e.expect(422, "GET", "/views/customers?tenantId=ten-lari&view=nope", e.admin, nil)
	e.expect(422, "GET", "/views/customers?tenantId=ten-lari&rules=nope", e.admin, nil)
	e.expect(403, "GET", "/views/customers", e.issue("orders:read").Secret, nil)
	e.expect(200, "GET", "/views/customers", e.issue("customers:read").Secret, nil)
}

func spendOf(m *metricRow) int64 {
	if m == nil {
		return 0
	}
	return m.Spend
}

func TestCustomerSummaryMatchesTheRows(t *testing.T) {
	e := setup(t)
	var out struct {
		Total            int                    `json:"total"`
		ByTier           map[string]int         `json:"byTier"`
		BySeller         map[string]int         `json:"bySeller"`
		Points           int64                  `json:"points"`
		Top              []domain.Customer      `json:"top"`
		Redeemable       []int                  `json:"redeemable"`
		Abandoned        int                    `json:"abandoned"`
		Segments         map[string]int         `json:"segments"`
		InCustomSegments int                    `json:"inCustomSegments"`
		Buyers           readmodel.BuyerFigures `json:"buyers"`
		NextCode         string                 `json:"nextCode"`
		Cities           []string               `json:"cities"`
		Tags             []string               `json:"tags"`
	}
	if code := e.call("GET", "/views/customer-summary?tenantId=ten-lari&rewards=100,500", e.admin, nil, &out); code != 200 {
		t.Fatalf("summary: %d", code)
	}
	customers := docs[domain.Customer](e, "customers", "ten-lari")
	if out.Total != len(customers) {
		t.Errorf("total %d, brand holds %d", out.Total, len(customers))
	}
	var points int64
	tiers, sellers, redeem := map[string]int{}, map[string]int{}, []int{0, 0}
	for _, c := range customers {
		points += int64(c.Points)
		tiers[c.Tier]++
		if c.SellerID != nil {
			sellers[*c.SellerID]++
		}
		for i, min := range []int{100, 500} {
			if c.Points >= min {
				redeem[i]++
			}
		}
	}
	if out.Points != points || !mapsEqual(out.ByTier, tiers) || !mapsEqual(out.BySeller, sellers) || !slices.Equal(out.Redeemable, redeem) {
		t.Errorf("counts differ: points %d/%d tiers %v/%v sellers %v/%v redeem %v/%v", out.Points, points, out.ByTier, tiers, out.BySeller, sellers, out.Redeemable, redeem)
	}
	slices.SortStableFunc(customers, func(a, b domain.Customer) int { return b.Points - a.Points })
	if len(out.Top) != 8 || out.Top[0].Points != customers[0].Points || out.Top[7].Points != customers[7].Points {
		t.Errorf("top by points: %d rows, first %d", len(out.Top), out.Top[0].Points)
	}
	if !strings.HasPrefix(out.NextCode, "LARI-C") || len(out.Cities) == 0 || len(out.Tags) == 0 {
		t.Errorf("form hints: %q %d cities %d tags", out.NextCode, len(out.Cities), len(out.Tags))
	}
	// Each segment's size is what the list finds with its rules.
	for _, seg := range docs[domain.Segment](e, "segments", "ten-lari") {
		rules, _ := json.Marshal(seg.Rules)
		got := e.customerRows(e.admin, url.Values{"rules": {string(rules)}, "match": {seg.Match}, "pageSize": {"1"}})
		if got.Total != out.Segments[seg.ID] {
			t.Errorf("segment %s: summary %d, list %d", seg.Name, out.Segments[seg.ID], got.Total)
		}
	}
	// The buyer figures sum the metrics rows.
	var buyers, repeat int
	var spend int64
	firstDays := map[string]int{}
	cutoff := readmodel.SalesCutoff(clock.MustParse(clock.FixtureNow))
	wib := time.FixedZone("WIB", 7*3600)
	for _, m := range e.metrics("ten-lari") {
		if m.Orders == 0 {
			continue
		}
		buyers++
		spend += m.Spend
		if m.Orders > 1 {
			repeat++
		}
		if day := m.FirstAt.In(wib).Format("2006-01-02"); day >= cutoff {
			firstDays[day]++
		}
	}
	b := out.Buyers
	if b.Buyers != buyers || b.RepeatBuyers != repeat || b.Spend != spend || !mapsEqual(b.FirstDays, firstDays) {
		t.Errorf("buyers %d/%d repeat %d/%d spend %d/%d first days %d/%d", b.Buyers, buyers, b.RepeatBuyers, repeat, b.Spend, spend, len(b.FirstDays), len(firstDays))
	}
	size := 0
	for _, c := range b.Cohorts {
		size += c.Size
	}
	if size == 0 || size > buyers {
		t.Errorf("cohorts hold %d buyers of %d", size, buyers)
	}

	var counts struct {
		Counts map[string]int `json:"counts"`
	}
	e.call("GET", "/views/customer-counts", e.admin, nil, &counts)
	if counts.Counts["ten-lari"] != out.Total || counts.Counts["ten-teknika"] != 0 {
		t.Errorf("customer counts: %v", counts.Counts)
	}
	e.expect(403, "GET", "/views/customer-summary?tenantId=ten-teknika", e.admin, nil)
	e.expect(422, "GET", "/views/customer-summary?tenantId=ten-lari&rewards=a", e.admin, nil)
}

func mapsEqual(a, b map[string]int) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}

func TestStateBoundsTheLogs(t *testing.T) {
	e := setup(t)
	ctx := context.Background()
	// 260 more stock moves than the seed holds, one hour apart, the oldest a month ago.
	start := clock.MustParse(clock.FixtureNow).Add(-30 * 24 * time.Hour)
	for i := range 260 {
		at := start.Add(time.Duration(i) * time.Hour).In(time.FixedZone("WIB", 7*3600)).Format(time.RFC3339)
		data := fmt.Sprintf(`{"id":"mv-bulk-%03d","tenantId":"ten-lari","variantId":"v","warehouseId":"w","qty":1,"kind":"adjustment","note":"","by":"usr-andi","at":%q}`, i, at)
		if _, err := e.db.Pool.Exec(ctx, `insert into stock_moves (id, data) values ($1, $2)`, fmt.Sprintf("mv-bulk-%03d", i), data); err != nil {
			t.Fatal(err)
		}
	}
	var total int
	_ = e.db.Pool.QueryRow(ctx, `select count(*) from stock_moves where tenant_id = 'ten-lari'`).Scan(&total)

	var state struct {
		State struct {
			StockMoves []domain.StockMove  `json:"stockMoves"`
			Traffic    []domain.TrafficDay `json:"traffic"`
		} `json:"state"`
	}
	e.call("GET", "/state", e.admin, nil, &state)
	lari := 0
	for i, m := range state.State.StockMoves {
		if m.TenantID == "ten-lari" {
			lari++
		}
		if i > 0 && m.At > state.State.StockMoves[i-1].At {
			t.Fatal("state stock moves are not newest first")
		}
	}
	if lari != 200 {
		t.Errorf("state carries %d stock moves of the brand, want the newest 200 of %d", lari, total)
	}
	cutoff := clock.MustParse(clock.FixtureNow).In(clock.WIB).AddDate(0, 0, -180).Format("2006-01-02")
	for _, d := range state.State.Traffic {
		if d.Day < cutoff {
			t.Fatalf("state carries traffic of %s, before %s", d.Day, cutoff)
		}
	}

	// The older rows page in: before the oldest row held, until none are left.
	var oldest, oldestID string
	for _, m := range state.State.StockMoves {
		if m.TenantID == "ten-lari" {
			oldest, oldestID = string(m.At), m.ID
		}
	}
	seen := lari
	for page := 0; ; page++ {
		var out struct {
			Rows []domain.StockMove `json:"rows"`
			More bool               `json:"more"`
		}
		path := "/views/stock-moves?tenantId=ten-lari&limit=40&before=" + url.QueryEscape(oldest) + "&beforeId=" + oldestID
		if code := e.call("GET", path, e.admin, nil, &out); code != 200 {
			t.Fatalf("%s: %d", path, code)
		}
		for _, m := range out.Rows {
			if string(m.At) > oldest {
				t.Fatalf("page %d holds %s, after %s", page, m.At, oldest)
			}
		}
		seen += len(out.Rows)
		if len(out.Rows) > 0 {
			last := out.Rows[len(out.Rows)-1]
			oldest, oldestID = string(last.At), last.ID
		}
		if !out.More || page > 20 {
			break
		}
	}
	// Seed moves share minutes; the id after the time keeps every one of them on a page.
	if seen != total {
		t.Errorf("paged through %d of %d stock moves", seen, total)
	}
	e.expect(200, "GET", "/views/integration-logs?tenantId=ten-lari", e.admin, nil)
	e.expect(403, "GET", "/views/integration-logs", e.issue("inventory:read").Secret, nil)
	e.expect(200, "GET", "/views/stock-moves", e.issue("inventory:read").Secret, nil)
	e.expect(422, "GET", "/views/stock-moves?tenantId=ten-lari&before=yesterday", e.admin, nil)
}

// raw sends a GET without Go's transparent gzip, so the test sees the wire as a browser would.
func raw(t *testing.T, target string, header http.Header) (*http.Response, []byte) {
	t.Helper()
	req, err := http.NewRequest("GET", target, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header = header
	client := &http.Client{Transport: &http.Transport{DisableCompression: true}}
	res, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	return res, body
}

func TestResponsesAreGzippedWhenAsked(t *testing.T) {
	e := setup(t)
	auth := http.Header{"Authorization": {"Bearer " + e.admin}, "Accept-Encoding": {"gzip, deflate, br"}}
	res, body := raw(t, e.url+"/state", auth)
	if res.Header.Get("Content-Encoding") != "gzip" || !strings.Contains(res.Header.Get("Vary"), "Accept-Encoding") {
		t.Fatalf("state: encoding %q vary %q", res.Header.Get("Content-Encoding"), res.Header.Get("Vary"))
	}
	zr, err := gzip.NewReader(strings.NewReader(string(body)))
	if err != nil {
		t.Fatal(err)
	}
	plain, _ := io.ReadAll(zr)
	var state struct {
		State map[string]json.RawMessage `json:"state"`
	}
	if err := json.Unmarshal(plain, &state); err != nil || len(state.State) == 0 {
		t.Fatalf("the gzipped state does not decode: %v", err)
	}
	if len(body)*3 > len(plain) {
		t.Errorf("gzip kept %d of %d bytes", len(body), len(plain))
	}

	// Without the header, or for a small answer, the body goes out as written.
	if res, _ := raw(t, e.url+"/state", http.Header{"Authorization": {"Bearer " + e.admin}}); res.Header.Get("Content-Encoding") != "" {
		t.Error("compressed for a client that did not ask")
	}
	if res, _ := raw(t, e.url+"/state", http.Header{"Authorization": {"Bearer " + e.admin}, "Accept-Encoding": {"gzip;q=0"}}); res.Header.Get("Content-Encoding") != "" {
		t.Error("compressed for a client that refused gzip")
	}
	if res, _ := raw(t, e.url+"/health", http.Header{"Accept-Encoding": {"gzip"}}); res.Header.Get("Content-Encoding") != "" {
		t.Error("compressed a health answer under 1 KB")
	}
	// The event stream stays plain, so each delta reaches the browser at once.
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", e.url+"/events?token="+url.QueryEscape(e.admin), nil)
	req.Header.Set("Accept-Encoding", "gzip")
	stream, err := (&http.Client{Transport: &http.Transport{DisableCompression: true}}).Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer stream.Body.Close()
	if stream.Header.Get("Content-Encoding") != "" || !strings.HasPrefix(stream.Header.Get("Content-Type"), "text/event-stream") {
		t.Errorf("event stream: encoding %q type %q", stream.Header.Get("Content-Encoding"), stream.Header.Get("Content-Type"))
	}
}

func TestShopStateRevalidatesWithAnETag(t *testing.T) {
	e := setup(t)
	res, body := raw(t, e.url+"/shop/lari/state", http.Header{})
	tag := res.Header.Get("ETag")
	if res.StatusCode != 200 || !strings.HasPrefix(tag, `W/"`) || !strings.Contains(res.Header.Get("Cache-Control"), "max-age=30") {
		t.Fatalf("shop state: %d etag %q cache %q", res.StatusCode, tag, res.Header.Get("Cache-Control"))
	}
	var shop struct {
		Now   string                     `json:"now"`
		State map[string]json.RawMessage `json:"state"`
	}
	if err := json.Unmarshal(body, &shop); err != nil || shop.Now == "" || len(shop.State) == 0 {
		t.Fatalf("shop state body: %v %q", err, shop.Now)
	}
	// The clock moves on every request but leaves the tag alone.
	again, _ := raw(t, e.url+"/shop/lari/state", http.Header{})
	if again.Header.Get("ETag") != tag {
		t.Errorf("the tag changed without a change: %q then %q", tag, again.Header.Get("ETag"))
	}
	notModified, empty := raw(t, e.url+"/shop/lari/state", http.Header{"If-None-Match": {tag}})
	if notModified.StatusCode != 304 || len(empty) != 0 {
		t.Errorf("If-None-Match: %d with %d bytes", notModified.StatusCode, len(empty))
	}
	strong, _ := raw(t, e.url+"/shop/lari/state", http.Header{"If-None-Match": {`"other", ` + strings.TrimPrefix(tag, "W/")}})
	if strong.StatusCode != 304 {
		t.Errorf("a tag list holding the tag without W/: %d", strong.StatusCode)
	}

	// A change to the store's dataset gives a new tag.
	var p domain.Product
	if err := e.db.Pool.QueryRow(context.Background(), `select data from products where tenant_id = 'ten-lari' and data->>'status' = 'active' order by id limit 1`).Scan(&p); err != nil {
		t.Fatal(err)
	}
	p.Name += " (new)"
	e.expect(200, "PUT", "/products/"+p.ID, e.admin, p)
	changed, _ := raw(t, e.url+"/shop/lari/state", http.Header{"If-None-Match": {tag}})
	if changed.StatusCode != 200 || changed.Header.Get("ETag") == tag {
		t.Errorf("after a product change: %d, tag %q", changed.StatusCode, changed.Header.Get("ETag"))
	}
}

// The summary comes from memory between writes, and a write that changes the brand's customers
// shows in the next one.
func TestCustomerSummaryCacheFollowsWrites(t *testing.T) {
	e := setup(t)
	read := func() (out struct {
		Total    int    `json:"total"`
		NextCode string `json:"nextCode"`
	}) {
		t.Helper()
		if code := e.call("GET", "/views/customer-summary?tenantId=ten-lari", e.admin, nil, &out); code != 200 {
			t.Fatalf("summary: %d", code)
		}
		return out
	}
	before := read()
	// A row written behind the API's back does not show until the cache ends.
	if _, err := e.db.Pool.Exec(context.Background(), `insert into customers (id, data) select 'cus-behind',
		data || '{"id": "cus-behind", "code": "LARI-C99990", "email": "behind@example.com"}' from customers where id = 'cus-lari-0001'`); err != nil {
		t.Fatal(err)
	}
	if again := read(); again.Total != before.Total {
		t.Errorf("summary not cached: %d then %d", before.Total, again.Total)
	}
	guest := map[string]any{"id": "cus-cache", "tenantId": "ten-lari", "code": "LARI-C00001", "name": "Cache Guest", "email": "cache@example.com",
		"createdAt": clock.FixtureNow, "tags": []string{}, "interests": []string{}, "tier": "member", "stage": "first_buyer"}
	e.expect(200, "POST", "/shop/lari/orders", "", map[string]any{"order": e.placeable("ord-cache", "cus-cache"), "customer": guest})
	after := read()
	if after.Total != before.Total+2 || after.NextCode != "LARI-C99991" {
		t.Errorf("after a checkout: total %d (was %d), next code %s", after.Total, before.Total, after.NextCode)
	}
}
