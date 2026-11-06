package events_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// Two hubs stand for two processes: the API publishes on one, the shop listens with the other.
func TestNotifyReachesAnotherHub(t *testing.T) {
	db := testdb.Open(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))

	api := events.New()
	notifier := events.NewNotifier(db.Pool, log)
	api.Forward(notifier.Enqueue)
	go notifier.Run(ctx)

	shop := events.New()
	go events.Listen(ctx, db.Pool, shop, log)
	deltas, leave := shop.Subscribe(events.Scope{TenantIDs: []string{"ten-lari"}, Collections: map[string]bool{"products": true}})
	defer leave()

	product := func(id, name string) events.Change {
		return events.Change{Upserts: map[string][]events.Row{"products": {{
			TenantID: "ten-lari", Data: json.RawMessage(`{"id":"` + id + `","name":"` + name + `"}`),
		}}}}
	}
	cases := []struct {
		label, id, name string
	}{
		{"inline", "prd-small", "Small"},
		// Over the NOTIFY limit, so it travels through event_log.
		{"event_log", "prd-large", strings.Repeat("x", 20000)},
	}
	for _, c := range cases {
		t.Run(c.label, func(t *testing.T) {
			// The listener may still be connecting, so publish until a delta arrives.
			deadline := time.After(10 * time.Second)
			resend := time.NewTicker(200 * time.Millisecond)
			defer resend.Stop()
			api.Publish(product(c.id, c.name))
			for {
				select {
				case data := <-deltas:
					var got struct {
						Upserts map[string][]struct {
							ID   string `json:"id"`
							Name string `json:"name"`
						} `json:"upserts"`
					}
					if err := json.Unmarshal(data, &got); err != nil {
						t.Fatal(err)
					}
					rows := got.Upserts["products"]
					if len(rows) != 1 {
						t.Fatalf("got %.200s", data)
					}
					// A resend from the case before may still be queued.
					if rows[0].ID != c.id {
						continue
					}
					if rows[0].Name != c.name {
						t.Fatalf("got %.200s", data)
					}
					return
				case <-resend.C:
					api.Publish(product(c.id, c.name))
				case <-deadline:
					t.Fatal("no delta reached the other hub")
				}
			}
		})
	}
	var logged int
	if err := db.Pool.QueryRow(ctx, `select count(*) from event_log`).Scan(&logged); err != nil {
		t.Fatal(err)
	}
	if logged == 0 {
		t.Error("the large change did not go through event_log")
	}
}

// Another tenant's change never reaches a store's stream, across processes as within one.
func TestNotifyKeepsScope(t *testing.T) {
	db := testdb.Open(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	notifier := events.NewNotifier(db.Pool, log)
	shop := events.New()
	go events.Listen(ctx, db.Pool, shop, log)
	deltas, leave := shop.Subscribe(events.Scope{TenantIDs: []string{"ten-lari"}})
	defer leave()
	other := events.Change{Upserts: map[string][]events.Row{"products": {{TenantID: "ten-aruna", Data: json.RawMessage(`{"id":"a"}`)}}}}
	mine := events.Change{Upserts: map[string][]events.Row{"products": {{TenantID: "ten-lari", Data: json.RawMessage(`{"id":"l"}`)}}}}
	deadline := time.After(10 * time.Second)
	for {
		if err := notifier.Send(ctx, other); err != nil {
			t.Fatal(err)
		}
		if err := notifier.Send(ctx, mine); err != nil {
			t.Fatal(err)
		}
		select {
		case data := <-deltas:
			if strings.Contains(string(data), `"a"`) {
				t.Fatalf("another tenant's row reached the stream: %s", data)
			}
			return
		case <-time.After(200 * time.Millisecond):
		case <-deadline:
			t.Fatal("no delta reached the other hub")
		}
	}
}
