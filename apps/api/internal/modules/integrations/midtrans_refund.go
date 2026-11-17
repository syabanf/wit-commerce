package integrations

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"

	"github.com/jackc/pgx/v5"
)

// Refunds through Midtrans for returns (PP 80/2019 Pasal 71). Each attempt is a payment_refunds
// row with its own refund_key. An attempt Midtrans never answered stays pending and the next try
// reuses its key, after asking Midtrans whether that key already refunded, so money moves once.

// RefundRequest asks the gateway to refund part of an order's payment for one return.
type RefundRequest struct {
	TenantID string
	OrderID  string
	ReturnID string
	Amount   int
	Reason   string
	At       string
}

// Refund is the outcome of a gateway refund: succeeded, failed (Midtrans said no) or pending
// (Midtrans did not answer). Reference is the refund key Midtrans holds the refund under.
type Refund struct {
	Status    string
	Reference string
	Amount    int
	Error     string
}

type refundRow struct {
	key     string
	attempt int
	status  string
	amount  int
}

func (s *Integrations) lastRefund(ctx context.Context, returnID string) (*refundRow, error) {
	var r refundRow
	err := s.DB.Pool.QueryRow(ctx, `select refund_key, attempt, status, amount from payment_refunds
		where return_id = $1 order by attempt desc limit 1`, returnID).Scan(&r.key, &r.attempt, &r.status, &r.amount)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &r, err
}

func (s *Integrations) settleRefund(ctx context.Context, key string, out Refund, at string) (Refund, error) {
	_, err := s.DB.Pool.Exec(ctx, `update payment_refunds set status = $2, gateway_ref = nullif($3, ''), error = nullif($4, ''),
		updated_at = $5 where refund_key = $1`, key, out.Status, out.Reference, out.Error, at)
	return out, err
}

// RefundMidtrans refunds req.Amount of the order's Midtrans payment for one return. The error is
// for the database only; what Midtrans said is in the Refund.
func (s *Integrations) RefundMidtrans(ctx context.Context, serverKey string, req RefundRequest) (Refund, error) {
	last, err := s.lastRefund(ctx, req.ReturnID)
	if err != nil {
		return Refund{}, err
	}
	attempt := 1
	if last != nil {
		switch last.status {
		case "succeeded":
			return Refund{Status: "succeeded", Reference: last.key, Amount: last.amount}, nil
		case "pending":
			if done, err := s.midtransHasRefund(ctx, serverKey, req.OrderID, last.key); err == nil && done {
				return s.settleRefund(ctx, last.key, Refund{Status: "succeeded", Reference: last.key, Amount: last.amount}, req.At)
			}
			// Same key again: had the first call reached Midtrans, it would refund once.
			attempt, req.Amount = last.attempt, last.amount
		default:
			attempt = last.attempt + 1
		}
	}
	key := fmt.Sprintf("%s-%d", req.ReturnID, attempt)
	if _, err := s.DB.Pool.Exec(ctx, `insert into payment_refunds (refund_key, order_id, tenant_id, return_id, attempt, provider, amount, status, created_at, updated_at)
		values ($1, $2, $3, $4, $5, 'midtrans', $6, 'pending', $7, $7)
		on conflict (refund_key) do update set status = 'pending', updated_at = $7`,
		key, req.OrderID, req.TenantID, req.ReturnID, attempt, req.Amount, req.At); err != nil {
		return Refund{}, err
	}
	body := map[string]any{"refund_key": key, "amount": req.Amount, "reason": req.Reason}
	raw, code, err := midtransCall(ctx, s.HTTP, http.MethodPost, coreHost(serverKey)+"/v2/"+url.PathEscape(req.OrderID)+"/refund", serverKey, body)
	if err != nil {
		return Refund{Status: "pending", Reference: key, Amount: req.Amount,
			Error: "Midtrans did not answer. Try again: the same refund will not run twice."}, nil
	}
	var answer struct {
		StatusCode    string `json:"status_code"`
		StatusMessage string `json:"status_message"`
	}
	_ = json.Unmarshal(raw, &answer)
	out := Refund{Status: "succeeded", Reference: key, Amount: req.Amount}
	if code != http.StatusOK || answer.StatusCode != "200" {
		out.Status, out.Error = "failed", answer.StatusMessage
		if out.Error == "" {
			out.Error = fmt.Sprintf("Midtrans answered %d.", code)
		}
	}
	return s.settleRefund(ctx, key, out, req.At)
}

// midtransHasRefund asks Midtrans whether the transaction lists a refund under this key.
func (s *Integrations) midtransHasRefund(ctx context.Context, serverKey, orderID, key string) (bool, error) {
	raw, code, err := midtransCall(ctx, s.HTTP, http.MethodGet, coreHost(serverKey)+"/v2/"+url.PathEscape(orderID)+"/status", serverKey, nil)
	if err != nil {
		return false, err
	}
	if code != http.StatusOK {
		return false, fmt.Errorf("midtrans status answered %d", code)
	}
	var st struct {
		Refunds []struct {
			RefundKey string `json:"refund_key"`
		} `json:"refunds"`
	}
	if err := json.Unmarshal(raw, &st); err != nil {
		return false, err
	}
	for _, r := range st.Refunds {
		if r.RefundKey == key {
			return true, nil
		}
	}
	return false, nil
}
