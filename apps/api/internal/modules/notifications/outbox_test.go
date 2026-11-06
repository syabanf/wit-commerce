package notifications

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/mail"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// fakeResend records each message by recipient and fails while fail is set.
type fakeResend struct {
	mu   sync.Mutex
	got  map[string]int
	text []string
	fail atomic.Bool
}

func outboxEnv(t *testing.T) (*Notifications, *fakeResend) {
	t.Helper()
	db := testdb.Open(t)
	fake := &fakeResend{got: map[string]int{}}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if fake.fail.Load() {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		var m struct {
			To   []string `json:"to"`
			Text string   `json:"text"`
		}
		_ = json.NewDecoder(r.Body).Decode(&m)
		time.Sleep(5 * time.Millisecond) // lets concurrent drains overlap
		fake.mu.Lock()
		fake.got[m.To[0]]++
		fake.text = append(fake.text, m.Text)
		fake.mu.Unlock()
	}))
	t.Cleanup(srv.Close)
	return &Notifications{
		Runtime:   &kernel.Runtime{DB: db},
		Mail:      mail.New(srv.URL, "re_test", "Shop <noreply@example.com>"),
		PublicURL: "https://shop.example.com",
		Log:       slog.New(slog.NewTextHandler(io.Discard, nil)),
	}, fake
}

type outboxRow struct {
	attempts  int
	due       time.Time
	sent      bool
	body      string
	lastError string
}

func readRow(t *testing.T, n *Notifications) outboxRow {
	t.Helper()
	var r outboxRow
	var lastError *string
	err := n.DB.Pool.QueryRow(t.Context(), `select attempts, next_attempt_at, sent_at is not null, html || text, last_error from email_outbox`).
		Scan(&r.attempts, &r.due, &r.sent, &r.body, &lastError)
	if err != nil {
		t.Fatal(err)
	}
	if lastError != nil {
		r.lastError = *lastError
	}
	return r
}

func TestQueuedEmailIsSentByDrain(t *testing.T) {
	n, fake := outboxEnv(t)
	n.MailUserReset(t.Context(), domain.User{ID: "usr-q", Email: "q@example.com"})
	if r := readRow(t, n); r.sent || !strings.Contains(r.body, "/reset-password?token=") {
		t.Fatalf("queued row: %+v", r)
	}
	if fake.got["q@example.com"] != 0 {
		t.Fatal("sent before the drain")
	}
	sent, err := n.Drain(t.Context())
	if err != nil || sent != 1 {
		t.Fatalf("drain: %d, %v", sent, err)
	}
	if fake.got["q@example.com"] != 1 || !strings.Contains(fake.text[0], "https://shop.example.com/reset-password?token=") {
		t.Fatalf("resend got %v %q", fake.got, fake.text)
	}
	if r := readRow(t, n); !r.sent || r.body != "" {
		t.Fatalf("after drain the row is sent and holds no link: %+v", r)
	}
	if sent, _ := n.Drain(t.Context()); sent != 0 {
		t.Errorf("a sent row went out again")
	}
}

func TestAFailedSendIsRescheduled(t *testing.T) {
	n, fake := outboxEnv(t)
	n.MailUserReset(t.Context(), domain.User{ID: "usr-r", Email: "r@example.com"})
	fake.fail.Store(true)
	if sent, err := n.Drain(t.Context()); err != nil || sent != 0 {
		t.Fatalf("drain: %d, %v", sent, err)
	}
	r := readRow(t, n)
	if r.sent || r.attempts != 1 || r.lastError != "resend: answered 502" || time.Until(r.due) < 20*time.Second {
		t.Fatalf("rescheduled row: %+v", r)
	}
	if sent, _ := n.Drain(t.Context()); sent != 0 || fake.got["r@example.com"] != 0 {
		t.Fatal("a row went out before its backoff ended")
	}
	fake.fail.Store(false)
	if _, err := n.DB.Pool.Exec(t.Context(), `update email_outbox set next_attempt_at = now()`); err != nil {
		t.Fatal(err)
	}
	if sent, err := n.Drain(t.Context()); err != nil || sent != 1 {
		t.Fatalf("retry: %d, %v", sent, err)
	}
	if r := readRow(t, n); !r.sent || r.attempts != 2 {
		t.Fatalf("after retry: %+v", r)
	}
}

func TestARowIsGivenUpAfterTheLastAttempt(t *testing.T) {
	n, fake := outboxEnv(t)
	n.MailUserReset(t.Context(), domain.User{ID: "usr-g", Email: "g@example.com"})
	fake.fail.Store(true)
	for range maxAttempts + 2 {
		if _, err := n.Drain(t.Context()); err != nil {
			t.Fatal(err)
		}
		if _, err := n.DB.Pool.Exec(t.Context(), `update email_outbox set next_attempt_at = now()`); err != nil {
			t.Fatal(err)
		}
	}
	r := readRow(t, n)
	if r.sent || r.attempts != maxAttempts || r.body != "" {
		t.Fatalf("given-up row: %+v", r)
	}
	if pending, err := n.Pending(t.Context()); err != nil || pending != 0 {
		t.Errorf("pending: %d, %v", pending, err)
	}
}

func TestConcurrentDrainsSendEachRowOnce(t *testing.T) {
	n, fake := outboxEnv(t)
	const rows = 40
	for i := range rows {
		m := mail.Message{To: fmt.Sprintf("c%d@example.com", i), Subject: "s", Text: "t", HTML: "h"}
		if err := enqueue(t.Context(), n.DB.Pool, "test", m); err != nil {
			t.Fatal(err)
		}
	}
	var total atomic.Int64
	var wg sync.WaitGroup
	for range 4 {
		wg.Go(func() {
			for {
				sent, err := n.Drain(t.Context())
				if err != nil {
					t.Error(err)
					return
				}
				if sent == 0 {
					return
				}
				total.Add(int64(sent))
			}
		})
	}
	wg.Wait()
	if total.Load() != rows || len(fake.got) != rows {
		t.Fatalf("sent %d, reached %d addresses", total.Load(), len(fake.got))
	}
	for to, count := range fake.got {
		if count != 1 {
			t.Errorf("%s got %d copies", to, count)
		}
	}
}

func TestEmailOffQueuesNothing(t *testing.T) {
	n, _ := outboxEnv(t)
	n.Mail = nil
	n.MailUserReset(t.Context(), domain.User{ID: "usr-off", Email: "off@example.com"})
	if pending, err := n.Pending(t.Context()); err != nil || pending != 0 {
		t.Fatalf("pending with email off: %d, %v", pending, err)
	}
}
