package billing

import (
	"context"
	"errors"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// PlanRequest is a brand asking for another plan, and what the platform answered.
type PlanRequest struct {
	ID           string  `json:"id"`
	TenantID     string  `json:"tenantId"`
	FromPlan     string  `json:"fromPlan"`
	ToPlan       string  `json:"toPlan"`
	Note         string  `json:"note"`
	Status       string  `json:"status"`
	RequestedBy  string  `json:"requestedBy"`
	RequestedAt  string  `json:"requestedAt"`
	DecidedBy    *string `json:"decidedBy"`
	DecidedAt    *string `json:"decidedAt"`
	DecisionNote string  `json:"decisionNote"`
}

const requestColumns = `id, tenant_id, from_plan, to_plan, note, status, requested_by, requested_at, decided_by, decided_at, decision_note`

func scanRequests(rows pgx.Rows) ([]PlanRequest, error) {
	defer rows.Close()
	out := []PlanRequest{}
	for rows.Next() {
		var r PlanRequest
		var requested time.Time
		var decided *time.Time
		if err := rows.Scan(&r.ID, &r.TenantID, &r.FromPlan, &r.ToPlan, &r.Note, &r.Status, &r.RequestedBy, &requested,
			&r.DecidedBy, &decided, &r.DecisionNote); err != nil {
			return nil, err
		}
		r.RequestedAt, r.DecidedAt = clock.Iso(requested), clock.IsoPtr(decided)
		out = append(out, r)
	}
	return out, rows.Err()
}

// Requests lists plan requests, newest first: one brand's, or every brand's when tenantID is empty.
func Requests(ctx context.Context, q store.Querier, tenantID string) ([]PlanRequest, error) {
	rows, err := q.Query(ctx, `select `+requestColumns+` from plan_requests
		where $1 = '' or tenant_id = $1 order by requested_at desc, id desc limit 200`, tenantID)
	if err != nil {
		return nil, err
	}
	return scanRequests(rows)
}

// Ask records a brand's request to move from one plan to another. A newer request replaces the one
// still waiting, so a brand never has two open.
func (b *Billing) Ask(ctx context.Context, m kernel.Meta, tenantID, fromPlan, toPlan, note string) (PlanRequest, error) {
	note = strings.TrimSpace(note)
	switch {
	case !Valid(toPlan):
		return PlanRequest{}, kernel.Invalid{Reason: "Choose one of the plans."}
	case toPlan == fromPlan:
		return PlanRequest{}, kernel.Refuse("Your store is already on this plan.")
	case len(note) > 500:
		return PlanRequest{}, kernel.Invalid{Reason: "Keep the note under 500 characters."}
	}
	r := PlanRequest{ID: ids.New("prq"), TenantID: tenantID, FromPlan: fromPlan, ToPlan: toPlan, Note: note,
		Status: "pending", RequestedBy: m.By(), RequestedAt: m.At}
	err := pgx.BeginFunc(ctx, b.DB.Pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `delete from plan_requests where tenant_id = $1 and status = 'pending'`, tenantID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `insert into plan_requests (id, tenant_id, from_plan, to_plan, note, status, requested_by, requested_at)
			values ($1, $2, $3, $4, $5, 'pending', $6, $7)`, r.ID, tenantID, fromPlan, toPlan, note, r.RequestedBy, clock.MustParse(m.At))
		return err
	})
	return r, err
}

// Decide approves or declines a waiting request inside the caller's transaction, which also changes
// the tenant's plan on approval. A request already answered is refused.
func Decide(t *kernel.Tx, m kernel.Meta, id string, approve bool, note string) (PlanRequest, error) {
	status := "declined"
	if approve {
		status = "approved"
	}
	rows, err := t.Query(t.Ctx, `update plan_requests set status = $2, decided_by = $3, decided_at = $4, decision_note = $5
		where id = $1 and status = 'pending' returning `+requestColumns, id, status, m.By(), clock.MustParse(m.At), strings.TrimSpace(note))
	if err != nil {
		return PlanRequest{}, err
	}
	decided, err := scanRequests(rows)
	if err != nil {
		return PlanRequest{}, err
	}
	if len(decided) == 0 {
		var known bool
		if err := t.QueryRow(t.Ctx, `select exists (select 1 from plan_requests where id = $1)`, id).Scan(&known); err != nil {
			return PlanRequest{}, err
		}
		if !known {
			return PlanRequest{}, kernel.NotFound{What: "plan request"}
		}
		return PlanRequest{}, kernel.Refuse("This request was already answered.")
	}
	return decided[0], nil
}

// Invoice is one month of one brand's plan. It records what is owed and whether the platform has
// been paid; nothing here collects money.
type Invoice struct {
	ID       string  `json:"id"`
	TenantID string  `json:"tenantId"`
	Period   string  `json:"period"`
	Plan     string  `json:"plan"`
	Amount   int64   `json:"amount"`
	Status   string  `json:"status"`
	IssuedAt string  `json:"issuedAt"`
	PaidAt   *string `json:"paidAt"`
}

// InvoiceStatuses are due, paid and void.
var InvoiceStatuses = []string{"due", "paid", "void"}

const invoiceColumns = `id, tenant_id, period, plan, amount, status, issued_at, paid_at`

func scanInvoice(row pgx.Row) (Invoice, error) {
	var i Invoice
	var issued time.Time
	var paid *time.Time
	err := row.Scan(&i.ID, &i.TenantID, &i.Period, &i.Plan, &i.Amount, &i.Status, &issued, &paid)
	i.IssuedAt, i.PaidAt = clock.Iso(issued), clock.IsoPtr(paid)
	return i, err
}

// Invoices lists invoices, newest period first: one brand's, or every brand's when tenantID is empty.
func Invoices(ctx context.Context, q store.Querier, tenantID string) ([]Invoice, error) {
	rows, err := q.Query(ctx, `select `+invoiceColumns+` from invoices
		where $1 = '' or tenant_id = $1 order by period desc, tenant_id limit 500`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Invoice{}
	for rows.Next() {
		i, err := scanInvoice(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, rows.Err()
}

// Issue writes the invoice of one brand for the month of at, unless that month already has one, and
// reports whether it wrote. The amount is the plan's price on the day of issue: a plan or price
// change later in the month shows on the next invoice.
func Issue(ctx context.Context, q store.Querier, tenantID string, plan Plan, at string) (bool, error) {
	tag, err := q.Exec(ctx, `insert into invoices (id, tenant_id, period, plan, amount, status, issued_at)
		values ($1, $2, $3, $4, $5, 'due', $6) on conflict (tenant_id, period) do nothing`,
		ids.New("inv"), tenantID, at[:7], plan.ID, plan.Price, clock.MustParse(at))
	return tag.RowsAffected() == 1, err
}

// SetInvoiceStatus records that an invoice was paid, voided, or is due again.
func (b *Billing) SetInvoiceStatus(ctx context.Context, m kernel.Meta, id, status string) (Invoice, error) {
	if !slices.Contains(InvoiceStatuses, status) {
		return Invoice{}, kernel.Invalid{Reason: "Mark the invoice due, paid or void."}
	}
	var paidAt *time.Time
	if status == "paid" {
		paidAt = kernel.Ptr(clock.MustParse(m.At))
	}
	i, err := scanInvoice(b.DB.Pool.QueryRow(ctx, `update invoices set status = $2, paid_at = $3, updated_by = $4
		where id = $1 returning `+invoiceColumns, id, status, paidAt, m.By()))
	if errors.Is(err, pgx.ErrNoRows) {
		return Invoice{}, kernel.NotFound{What: "invoice"}
	}
	return i, err
}
