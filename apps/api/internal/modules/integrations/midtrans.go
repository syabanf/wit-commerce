package integrations

import (
	"bytes"
	"context"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Midtrans takes payments for a brand that saved its server key in the app marketplace. Keys that
// start with SB- belong to the sandbox. No function here logs or returns a key.

func midtransSandbox(serverKey string) bool { return strings.HasPrefix(serverKey, "SB-") }

func snapHost(serverKey string) string {
	if midtransSandbox(serverKey) {
		return "https://app.sandbox.midtrans.com"
	}
	return "https://app.midtrans.com"
}

func coreHost(serverKey string) string {
	if midtransSandbox(serverKey) {
		return "https://api.sandbox.midtrans.com"
	}
	return "https://api.midtrans.com"
}

// midtransIntegration is the id of the tenant's enabled Midtrans integration with a server key
// saved, or "" when it has none.
func (s *Integrations) midtransIntegration(ctx context.Context, tenantID string) (string, error) {
	rows, err := store.List[domain.Integration](ctx, s.DB.Pool, "integrations",
		"tenant_id = $1 and data->>'provider' = 'Midtrans' and (data->>'enabled')::boolean", tenantID)
	if err != nil || len(rows) == 0 {
		return "", err
	}
	var exists bool
	if err := s.DB.Pool.QueryRow(ctx, `select exists (select 1 from connector_secrets where integration_id = $1 and field = 'server_key')`,
		rows[0].ID).Scan(&exists); err != nil || !exists {
		return "", err
	}
	return rows[0].ID, nil
}

// MidtransReady reports whether the tenant collects payments through Midtrans: its integration is
// on and holds a server key. It decrypts nothing.
func (s *Integrations) MidtransReady(ctx context.Context, tenantID string) (bool, error) {
	id, err := s.midtransIntegration(ctx, tenantID)
	return id != "", err
}

// MidtransServerKey is the tenant's Midtrans server key, or "" when MidtransReady is false.
func (s *Integrations) MidtransServerKey(ctx context.Context, tenantID string) (string, error) {
	id, err := s.midtransIntegration(ctx, tenantID)
	if err != nil || id == "" {
		return "", err
	}
	values, err := s.ConnectorValues(ctx, id)
	if err != nil {
		return "", err
	}
	return values["server_key"], nil
}

// SnapRequest is the body of a Snap transaction.
type SnapRequest struct {
	TransactionDetails SnapTransaction `json:"transaction_details"`
	CustomerDetails    *SnapCustomer   `json:"customer_details,omitempty"`
	ItemDetails        []SnapItem      `json:"item_details"`
	EnabledPayments    []string        `json:"enabled_payments,omitempty"`
	Callbacks          *SnapCallbacks  `json:"callbacks,omitempty"`
}

type (
	SnapTransaction struct {
		OrderID     string `json:"order_id"`
		GrossAmount int    `json:"gross_amount"`
	}
	SnapCustomer struct {
		FirstName string `json:"first_name"`
		Email     string `json:"email,omitempty"`
		Phone     string `json:"phone,omitempty"`
	}
	SnapItem struct {
		ID       string `json:"id"`
		Price    int    `json:"price"`
		Quantity int    `json:"quantity"`
		Name     string `json:"name"`
	}
	SnapCallbacks struct {
		Finish string `json:"finish"`
	}
)

// Payment is what Commerce OS knows about an order's online payment. It carries no key.
type Payment struct {
	OrderID       string  `json:"orderId"`
	TenantID      string  `json:"tenantId"`
	Provider      string  `json:"provider"`
	TransactionID *string `json:"transactionId"`
	Status        string  `json:"status"`
	SnapToken     *string `json:"snapToken"`
	RedirectURL   *string `json:"redirectUrl"`
	GrossAmount   int     `json:"grossAmount"`
	NotifiedAt    *string `json:"notifiedAt"`
	CreatedAt     string  `json:"createdAt"`
	UpdatedAt     string  `json:"updatedAt"`
}

func midtransCall(ctx context.Context, client *http.Client, method, target, serverKey string, body any) ([]byte, int, error) {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, target, reader)
	if err != nil {
		return nil, 0, err
	}
	req.SetBasicAuth(serverKey, "")
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := client.Do(req)
	if err != nil {
		// The error names the URL and never the key, which travels in a header.
		return nil, 0, fmt.Errorf("midtrans: %w", err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	return raw, res.StatusCode, err
}

// StartMidtransPayment creates a Snap transaction for the order and records it. When the order
// already has one, it returns that instead, so a retry never charges twice.
func (s *Integrations) StartMidtransPayment(ctx context.Context, tenantID, serverKey string, req SnapRequest, at string) (*Payment, error) {
	if p, err := s.PaymentFor(ctx, req.TransactionDetails.OrderID); err != nil || p != nil {
		return p, err
	}
	raw, code, err := midtransCall(ctx, s.HTTP, http.MethodPost, snapHost(serverKey)+"/snap/v1/transactions", serverKey, req)
	if err != nil {
		return nil, err
	}
	var snap struct {
		Token         string   `json:"token"`
		RedirectURL   string   `json:"redirect_url"`
		ErrorMessages []string `json:"error_messages"`
	}
	_ = json.Unmarshal(raw, &snap)
	if code != http.StatusCreated && code != http.StatusOK || snap.RedirectURL == "" {
		return nil, fmt.Errorf("midtrans snap answered %d: %s", code, strings.Join(snap.ErrorMessages, "; "))
	}
	if _, err := s.DB.Pool.Exec(ctx, `insert into payments (order_id, tenant_id, provider, status, snap_token, redirect_url, gross_amount, created_at, updated_at)
		values ($1, $2, 'midtrans', 'pending', $3, $4, $5, $6, $6) on conflict (order_id) do nothing`,
		req.TransactionDetails.OrderID, tenantID, snap.Token, snap.RedirectURL, req.TransactionDetails.GrossAmount, at); err != nil {
		return nil, err
	}
	return s.PaymentFor(ctx, req.TransactionDetails.OrderID)
}

// PaymentFor reads an order's payment record, or nil when it has none.
func (s *Integrations) PaymentFor(ctx context.Context, orderID string) (*Payment, error) {
	var p Payment
	var notified *time.Time
	var created, updated time.Time
	err := s.DB.Pool.QueryRow(ctx, `select order_id, tenant_id, provider, transaction_id, status, snap_token, redirect_url,
		gross_amount, notified_at, created_at, updated_at from payments where order_id = $1`, orderID).Scan(
		&p.OrderID, &p.TenantID, &p.Provider, &p.TransactionID, &p.Status, &p.SnapToken, &p.RedirectURL,
		&p.GrossAmount, &notified, &created, &updated)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if notified != nil {
		at := notified.UTC().Format(time.RFC3339)
		p.NotifiedAt = &at
	}
	p.CreatedAt, p.UpdatedAt = created.UTC().Format(time.RFC3339), updated.UTC().Format(time.RFC3339)
	return &p, nil
}

// MidtransNotification is the part of a Midtrans notification or status answer Commerce OS reads.
type MidtransNotification struct {
	OrderID           string `json:"order_id"`
	StatusCode        string `json:"status_code"`
	GrossAmount       string `json:"gross_amount"`
	SignatureKey      string `json:"signature_key"`
	TransactionID     string `json:"transaction_id"`
	TransactionStatus string `json:"transaction_status"`
	FraudStatus       string `json:"fraud_status"`
}

// MidtransSignatureValid checks signature_key = sha512(order_id + status_code + gross_amount + server key).
func MidtransSignatureValid(n MidtransNotification, serverKey string) bool {
	sum := sha512.Sum512([]byte(n.OrderID + n.StatusCode + n.GrossAmount + serverKey))
	want := hex.EncodeToString(sum[:])
	return subtle.ConstantTimeCompare([]byte(want), []byte(strings.ToLower(n.SignatureKey))) == 1
}

// MidtransStatus asks Midtrans for the transaction's status, so a notification is never trusted on
// its own.
func (s *Integrations) MidtransStatus(ctx context.Context, serverKey, orderID string) (MidtransNotification, error) {
	var st MidtransNotification
	raw, code, err := midtransCall(ctx, s.HTTP, http.MethodGet, coreHost(serverKey)+"/v2/"+url.PathEscape(orderID)+"/status", serverKey, nil)
	if err != nil {
		return st, err
	}
	if code != http.StatusOK {
		return st, fmt.Errorf("midtrans status answered %d", code)
	}
	if err := json.Unmarshal(raw, &st); err != nil {
		return st, fmt.Errorf("midtrans status: %w", err)
	}
	if st.OrderID != orderID {
		return st, errors.New("midtrans status names another order")
	}
	return st, nil
}

// RecordMidtransStatus stores the checked status and the notification that prompted the check.
func (s *Integrations) RecordMidtransStatus(ctx context.Context, st MidtransNotification, notification []byte, at string) error {
	status := st.TransactionStatus
	if status == "capture" && st.FraudStatus != "" {
		status += "/" + st.FraudStatus
	}
	_, err := s.DB.Pool.Exec(ctx, `update payments set status = $2, transaction_id = nullif($3, ''), last_notification = $4,
		notified_at = $5, updated_at = $5 where order_id = $1`, st.OrderID, status, st.TransactionID, string(notification), at)
	return err
}
