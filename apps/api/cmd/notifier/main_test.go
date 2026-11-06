package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/notifications"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

func TestHealthReportsTheQueueAndTheDatabase(t *testing.T) {
	db := testdb.Open(t)
	srv := httptest.NewServer(healthHandler(&notifications.Notifications{Runtime: &kernel.Runtime{DB: db}}))
	defer srv.Close()
	check := func(status, pending int) {
		t.Helper()
		res, err := http.Get(srv.URL + "/health")
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		var body struct {
			Pending int  `json:"pending"`
			Email   bool `json:"email"`
		}
		_ = json.NewDecoder(res.Body).Decode(&body)
		if res.StatusCode != status || body.Pending != pending || body.Email {
			t.Errorf("health: %d %+v", res.StatusCode, body)
		}
	}
	check(200, 0)
	if _, err := db.Pool.Exec(t.Context(), `insert into email_outbox ("to", subject, html, text, kind) values ('a@example.com', 's', 'h', 't', 'test')`); err != nil {
		t.Fatal(err)
	}
	check(200, 1)
	db.Pool.Close()
	check(503, 0)
}
