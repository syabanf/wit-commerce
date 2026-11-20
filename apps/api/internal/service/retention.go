package service

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/notifications"
)

// Retention is how long the housekeeping keeps each log before deleting it. Zero keeps a log forever.
//
// PP 80/2019 Pasal 25 asks a PMSE operator to keep transaction data for 10 years and other PMSE data
// for 5 years. Orders, payments, refunds, returns, invoices and customers are never pruned here.
// Stock moves record what each order and return did to stock, so they count as transaction data and
// keep 10 years. Integration logs (connector calls and their results) and traffic (daily visit counts,
// no personal data) are records of the electronic system, so they keep the 5 years that apply to
// other PMSE data. The request log, finished webhook deliveries and finished email are operational
// queues and debugging aids, not the record of a transaction, and keep 30 days. The audit log is
// the record of who changed what in the system (UU PDP Pasal 31), other PMSE data, and keeps 5
// years. Product CSV imports are working copies of an uploaded file and keep 30 days.
type Retention struct {
	RequestLog        time.Duration
	WebhookDeliveries time.Duration
	EmailOutbox       time.Duration
	StockMoves        time.Duration
	IntegrationLogs   time.Duration
	Traffic           time.Duration
	AuditLog          time.Duration
	ProductImports    time.Duration
}

const (
	day  = 24 * time.Hour
	year = 365 * day
)

// Legal floors: an env value below these is raised to them.
const (
	transactionYears = 10
	pmseYears        = 5
)

// DefaultRetention is 30 days for the operational logs and the PP 80/2019 periods for the rest.
func DefaultRetention() Retention {
	return Retention{
		RequestLog: 30 * day, WebhookDeliveries: 30 * day, EmailOutbox: 30 * day,
		StockMoves: transactionYears * year, IntegrationLogs: pmseYears * year, Traffic: pmseYears * year,
		AuditLog: pmseYears * year, ProductImports: 30 * day,
	}
}

// RetentionFromEnv reads RETAIN_*_DAYS and RETAIN_*_YEARS over the defaults. A value of 0 keeps that
// log forever. A legal period set below its floor is raised to the floor; warnings say what was
// ignored or raised.
func RetentionFromEnv(getenv func(string) string) (Retention, []string) {
	r := DefaultRetention()
	var warnings []string
	read := func(key string, unit time.Duration, floor int, into *time.Duration) {
		v := getenv(key)
		if v == "" {
			return
		}
		n, err := strconv.Atoi(v)
		switch {
		case err != nil || n < 0:
			warnings = append(warnings, fmt.Sprintf("%s=%q is not a whole number of at least 0; keeping the default", key, v))
		case n == 0:
			*into = 0
		case n < floor:
			warnings = append(warnings, fmt.Sprintf("%s=%d is below the %d that PP 80/2019 requires; using %d", key, n, floor, floor))
			*into = time.Duration(floor) * unit
		default:
			*into = time.Duration(n) * unit
		}
	}
	read("RETAIN_REQUEST_LOG_DAYS", day, 1, &r.RequestLog)
	read("RETAIN_WEBHOOK_DELIVERIES_DAYS", day, 1, &r.WebhookDeliveries)
	read("RETAIN_EMAIL_OUTBOX_DAYS", day, 1, &r.EmailOutbox)
	read("RETAIN_STOCK_MOVES_YEARS", year, transactionYears, &r.StockMoves)
	read("RETAIN_INTEGRATION_LOGS_YEARS", year, pmseYears, &r.IntegrationLogs)
	read("RETAIN_TRAFFIC_YEARS", year, pmseYears, &r.Traffic)
	read("RETAIN_AUDIT_LOG_YEARS", year, pmseYears, &r.AuditLog)
	read("RETAIN_PRODUCT_IMPORTS_DAYS", day, 1, &r.ProductImports)
	return r, warnings
}

// pruneBatch is how many rows one delete takes, and pruneBatches how many deletes one table gets per
// run, so a first run over a large backlog commits in pieces and never holds a long lock. What is
// left goes on the next run.
const (
	pruneBatch   = 5000
	pruneBatches = 20
)

// pruneEvery is how often PruneIfDue does the work; the tick calls it every minute.
const pruneEvery = time.Hour

// PruneIfDue runs Prune when the last run, by any API process, was over an hour ago. appNow is the
// demo clock, which the documents' own timestamps follow.
func (s *Service) PruneIfDue(ctx context.Context, appNow time.Time, r Retention) (map[string]int64, error) {
	var due bool
	err := s.DB.Pool.QueryRow(ctx, `insert into meta (key, value) values ('retention_pruned_at', $1)
		on conflict (key) do update set value = excluded.value
		where meta.value::timestamptz < $1::timestamptz - $2::interval
		returning true`, time.Now().UTC().Format(time.RFC3339), pruneEvery.String()).Scan(&due)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return s.Prune(ctx, time.Now(), appNow, r)
}

// Prune deletes what each retention period has passed, in bounded batches, and returns the rows
// deleted per table. realNow is the clock of the log tables (database now()); appNow is the demo
// clock that document timestamps follow.
func (s *Service) Prune(ctx context.Context, realNow, appNow time.Time, r Retention) (map[string]int64, error) {
	// Document timestamps are ISO text in WIB, so a text comparison against an ISO cutoff works.
	logs := func(keep time.Duration) any { return realNow.Add(-keep) }
	docs := func(keep time.Duration) any { return clock.Iso(appNow.Add(-keep)) }
	days := func(keep time.Duration) any { return clock.Iso(appNow.Add(-keep))[:10] }
	jobs := []struct {
		table, where string
		keep         time.Duration
		cutoff       func(time.Duration) any
	}{
		{"request_log", "at < $1", r.RequestLog, logs},
		// Pending deliveries stay whatever their age; delivered and failed ones go.
		{"webhook_deliveries", "status <> 'pending' and created_at < $1", r.WebhookDeliveries, logs},
		// Sent mail, and mail given up after its last attempt (its html and text are already blank).
		{"email_outbox", fmt.Sprintf("(sent_at is not null or attempts >= %d) and created_at < $1", notifications.MaxAttempts), r.EmailOutbox, logs},
		{"stock_moves", "at < $1", r.StockMoves, docs},
		{"integration_logs", "at < $1", r.IntegrationLogs, docs},
		{"traffic", "day < $1", r.Traffic, days},
		{"audit_log", "at < $1", r.AuditLog, logs},
		{"product_imports", "created_at < $1", r.ProductImports, logs},
	}
	deleted := map[string]int64{}
	for _, j := range jobs {
		if j.keep <= 0 {
			continue
		}
		sql := fmt.Sprintf(`delete from %[1]s where id in (select id from %[1]s where %[2]s limit %[3]d)`, j.table, j.where, pruneBatch)
		cutoff := j.cutoff(j.keep)
		for range pruneBatches {
			tag, err := s.pruneExec(ctx, j.table, sql, cutoff)
			if err != nil {
				return deleted, fmt.Errorf("prune %s: %w", j.table, err)
			}
			if n := tag.RowsAffected(); n > 0 {
				deleted[j.table] += n
			}
			if tag.RowsAffected() < pruneBatch {
				break
			}
		}
	}
	return deleted, nil
}

// pruneExec runs one prune delete. The audit log refuses deletes unless its transaction sets
// audit.prune (see migration 0036), so its batches run in a transaction that does.
func (s *Service) pruneExec(ctx context.Context, table, sql string, cutoff any) (pgconn.CommandTag, error) {
	if table != "audit_log" {
		return s.DB.Pool.Exec(ctx, sql, cutoff)
	}
	var tag pgconn.CommandTag
	err := pgx.BeginFunc(ctx, s.DB.Pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `select set_config('audit.prune', 'on', true)`); err != nil {
			return err
		}
		var err error
		tag, err = tx.Exec(ctx, sql, cutoff)
		return err
	})
	return tag, err
}
