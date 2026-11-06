package events

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// NotifyChannel is the Postgres channel that carries changes between processes.
const NotifyChannel = "commerce_events"

// notifyLimit keeps a payload under Postgres' 8000-byte NOTIFY limit. A larger change goes through
// the event_log table and the notification carries its id.
const notifyLimit = 7900

// envelope is one notification: the change itself, or the event_log id that holds it.
type envelope struct {
	Change *Change `json:"change,omitempty"`
	ID     int64   `json:"id,omitempty"`
}

// Notifier sends the changes a hub publishes to other processes with NOTIFY.
type Notifier struct {
	pool  *pgxpool.Pool
	log   *slog.Logger
	queue chan Change
}

// NewNotifier makes a notifier; call Run to start sending.
func NewNotifier(pool *pgxpool.Pool, log *slog.Logger) *Notifier {
	return &Notifier{pool: pool, log: log, queue: make(chan Change, 256)}
}

// Enqueue is the hub's Forward function. It never blocks a request: when the queue is full the
// change is dropped, like a slow stream reader's.
func (n *Notifier) Enqueue(c Change) {
	select {
	case n.queue <- c:
	default:
		n.log.Warn("event notify queue full; change dropped")
	}
}

// Run sends queued changes one at a time, in publish order, until ctx ends.
func (n *Notifier) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case c := <-n.queue:
			if err := n.Send(ctx, c); err != nil && ctx.Err() == nil {
				n.log.Error("event notify failed", "err", err)
			}
		}
	}
}

// Send notifies one change, through event_log when it is too large to go inline.
func (n *Notifier) Send(ctx context.Context, c Change) error {
	payload, err := json.Marshal(envelope{Change: &c})
	if err != nil {
		return err
	}
	if len(payload) <= notifyLimit {
		_, err = n.pool.Exec(ctx, `select pg_notify($1, $2)`, NotifyChannel, string(payload))
		return err
	}
	change, err := json.Marshal(c)
	if err != nil {
		return err
	}
	// NOTIFY is delivered at commit, so the listener always finds the row.
	return pgx.BeginFunc(ctx, n.pool, func(tx pgx.Tx) error {
		var id int64
		if err := tx.QueryRow(ctx, `insert into event_log (change) values ($1) returning id`, string(change)).Scan(&id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `delete from event_log where created_at < now() - interval '10 minutes'`); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `select pg_notify($1, $2)`, NotifyChannel, fmt.Sprintf(`{"id":%d}`, id))
		return err
	})
}

// Listen delivers the changes other processes notify to this process's hub until ctx ends. It
// reconnects after an error; changes sent while it was away are lost.
func Listen(ctx context.Context, pool *pgxpool.Pool, hub *Hub, log *slog.Logger) {
	for {
		err := listen(ctx, pool, hub, log)
		if ctx.Err() != nil {
			return
		}
		log.Error("event listener lost its connection", "err", err)
		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Second):
		}
	}
}

func listen(ctx context.Context, pool *pgxpool.Pool, hub *Hub, log *slog.Logger) error {
	acquired, err := pool.Acquire(ctx)
	if err != nil {
		return err
	}
	// The connection keeps its LISTEN, so it leaves the pool for good.
	conn := acquired.Hijack()
	defer conn.Close(context.Background())
	if _, err := conn.Exec(ctx, "listen "+NotifyChannel); err != nil {
		return err
	}
	for {
		note, err := conn.WaitForNotification(ctx)
		if err != nil {
			return err
		}
		c, err := readChange(ctx, conn, note.Payload)
		if err != nil {
			log.Error("event notification unreadable", "err", err)
			continue
		}
		hub.Deliver(c)
	}
}

func readChange(ctx context.Context, conn *pgx.Conn, payload string) (Change, error) {
	var e envelope
	if err := json.Unmarshal([]byte(payload), &e); err != nil {
		return Change{}, err
	}
	if e.Change != nil {
		return *e.Change, nil
	}
	if e.ID == 0 {
		return Change{}, errors.New("notification has neither a change nor an id")
	}
	var raw []byte
	if err := conn.QueryRow(ctx, `select change from event_log where id = $1`, e.ID).Scan(&raw); err != nil {
		return Change{}, fmt.Errorf("event_log %d: %w", e.ID, err)
	}
	var c Change
	return c, json.Unmarshal(raw, &c)
}
