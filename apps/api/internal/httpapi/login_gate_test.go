package httpapi_test

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// With one password slot and almost no wait, a burst of sign-ins gets 503 and Retry-After for the
// ones that find the slot taken, and the rest sign in as usual.
func TestLoginBurstQueuesThenAnswersBusy(t *testing.T) {
	db := testdb.Open(t)
	if err := seed.Load(context.Background(), db, testdb.SeedDir(t), password); err != nil {
		t.Fatal(err)
	}
	signer, err := auth.NewSigner(strings.Repeat("s", 32), time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(httpapi.New(httpapi.Options{
		DB: db, Clock: clock.New(time.Now()), Signer: signer, Hub: events.New(),
		Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test",
		PasswordSlots: 1, PasswordWait: time.Millisecond,
	}))
	t.Cleanup(srv.Close)

	const n = 6
	codes := make([]int, n)
	retry := make([]string, n)
	var wg sync.WaitGroup
	for i := range n {
		wg.Go(func() {
			res, err := http.Post(srv.URL+"/api/v1/auth/login", "application/json",
				bytes.NewBufferString(`{"email":"andi@lari.co.id","password":"`+password+`"}`))
			if err != nil {
				t.Error(err)
				return
			}
			res.Body.Close()
			codes[i], retry[i] = res.StatusCode, res.Header.Get("Retry-After")
		})
	}
	wg.Wait()
	var ok, busy int
	for i, code := range codes {
		switch {
		case code == http.StatusOK:
			ok++
		case code == http.StatusServiceUnavailable && retry[i] != "":
			busy++
		default:
			t.Errorf("login %d: %d (Retry-After %q)", i, code, retry[i])
		}
	}
	if ok == 0 || busy == 0 {
		t.Fatalf("%d signed in and %d were told to retry; want some of each", ok, busy)
	}
}
