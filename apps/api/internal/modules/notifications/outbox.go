package notifications

import (
	"context"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/mail"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

const (
	// drainBatch rows go out per claim. With sendTimeout each, a batch ends well inside claimLease.
	drainBatch = 10
	// claimLease hides a claimed row from other workers. A worker that dies mid-batch leaves its rows
	// to come back after the lease, so delivery is at least once.
	claimLease = 5 * time.Minute
	// maxAttempts sends, with backoff from 30 seconds doubling to an hour, span about an hour: as
	// long as a reset link lives.
	maxAttempts  = 8
	firstBackoff = 30 * time.Second
	maxBackoff   = time.Hour
	// bookkeepingTimeout bounds the update after a send, which runs even while shutting down.
	bookkeepingTimeout = 5 * time.Second
)

// enqueue writes a message for Drain to send.
func enqueue(ctx context.Context, q store.Querier, kind string, m mail.Message) error {
	_, err := q.Exec(ctx, `insert into email_outbox ("to", subject, html, text, kind) values ($1, $2, $3, $4, $5)`,
		m.To, m.Subject, m.HTML, m.Text, kind)
	return err
}

type queued struct {
	id       int64
	attempts int
	msg      mail.Message
}

// claim takes due rows and pushes them out of sight for claimLease. skip locked lets several
// workers claim at once, each getting different rows.
func (n *Notifications) claim(ctx context.Context) ([]queued, error) {
	rows, err := n.DB.Pool.Query(ctx, `update email_outbox set attempts = attempts + 1, next_attempt_at = now() + $2 * interval '1 second'
		where id in (select id from email_outbox where sent_at is null and attempts < $3 and next_attempt_at <= now()
			order by next_attempt_at limit $1 for update skip locked)
		returning id, attempts, "to", subject, html, text`, drainBatch, claimLease.Seconds(), maxAttempts)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []queued
	for rows.Next() {
		var q queued
		if err := rows.Scan(&q.id, &q.attempts, &q.msg.To, &q.msg.Subject, &q.msg.HTML, &q.msg.Text); err != nil {
			return nil, err
		}
		out = append(out, q)
	}
	return out, rows.Err()
}

func backoff(attempts int) time.Duration {
	d := firstBackoff << (attempts - 1)
	if d <= 0 || d > maxBackoff {
		return maxBackoff
	}
	return d
}

// Drain sends one batch of due email and reports how many went out. With no mail client it leaves
// every row as it is. A row is marked sent after Resend accepts it; a failed send comes back after a
// backoff, and after maxAttempts it stays unsent with its link blanked.
func (n *Notifications) Drain(ctx context.Context) (int, error) {
	if n.Mail == nil {
		return 0, nil
	}
	batch, err := n.claim(ctx)
	if err != nil {
		return 0, err
	}
	sent := 0
	for i, q := range batch {
		if ctx.Err() != nil {
			return sent, n.release(batch[i:])
		}
		sendCtx, cancel := context.WithTimeout(ctx, sendTimeout)
		sendErr := n.Mail.Send(sendCtx, q.msg)
		cancel()
		if err := n.settle(ctx, q, sendErr); err != nil {
			return sent, err
		}
		if sendErr == nil {
			sent++
		}
	}
	return sent, nil
}

// settle records the outcome of one send. It outlives a cancelled ctx, so a send that went out
// during shutdown is still marked and not sent twice.
func (n *Notifications) settle(ctx context.Context, q queued, sendErr error) error {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), bookkeepingTimeout)
	defer cancel()
	if sendErr == nil {
		_, err := n.DB.Pool.Exec(ctx, `update email_outbox set sent_at = now(), html = '', text = '', last_error = null where id = $1`, q.id)
		return err
	}
	// Errors from mail name the status only, never the body, so they are safe to store and log.
	if q.attempts >= maxAttempts {
		n.Log.Error("email given up", "err", sendErr, "id", q.id, "subject", q.msg.Subject)
		_, err := n.DB.Pool.Exec(ctx, `update email_outbox set html = '', text = '', last_error = $2 where id = $1`, q.id, sendErr.Error())
		return err
	}
	n.Log.Warn("email not sent, will retry", "err", sendErr, "id", q.id, "attempts", q.attempts)
	_, err := n.DB.Pool.Exec(ctx, `update email_outbox set next_attempt_at = now() + $2 * interval '1 second', last_error = $3 where id = $1`,
		q.id, backoff(q.attempts).Seconds(), sendErr.Error())
	return err
}

// release hands back rows claimed but not tried, so they go out on the next drain.
func (n *Notifications) release(rows []queued) error {
	ids := make([]int64, len(rows))
	for i, q := range rows {
		ids[i] = q.id
	}
	ctx, cancel := context.WithTimeout(context.Background(), bookkeepingTimeout)
	defer cancel()
	_, err := n.DB.Pool.Exec(ctx, `update email_outbox set attempts = attempts - 1, next_attempt_at = now() where id = any($1)`, ids)
	return err
}

// Run drains every interval until ctx ends. A full batch drains again at once.
func (n *Notifications) Run(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		sent, err := n.Drain(ctx)
		if err != nil && ctx.Err() == nil {
			n.Log.Error("email drain failed", "err", err)
		}
		if sent == drainBatch {
			continue
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// Pending counts the rows still to be sent, given-up rows aside.
func (n *Notifications) Pending(ctx context.Context) (int, error) {
	var count int
	err := n.DB.Pool.QueryRow(ctx, `select count(*) from email_outbox where sent_at is null and attempts < $1`, maxAttempts).Scan(&count)
	return count, err
}
