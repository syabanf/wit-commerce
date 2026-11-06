package integrations

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
)

// WebhookEvents is the catalog an endpoint subscribes to.
var WebhookEvents = []string{
	"order.created", "order.paid", "order.shipped", "customer.created", "customer.updated",
	"product.updated", "inventory.updated",
}

// webhookPing goes to one endpoint on request and needs no subscription.
const webhookPing = "webhook.test"

// retryAfter is the wait before each further attempt: about a day in all, then the delivery fails.
var retryAfter = []time.Duration{
	time.Minute, 5 * time.Minute, 30 * time.Minute, 2 * time.Hour, 6 * time.Hour, 16 * time.Hour,
}

// WebhookEndpoint is an endpoint as the console sees it; the signing secret stays out.
type WebhookEndpoint struct {
	ID        string   `json:"id"`
	TenantID  string   `json:"tenantId"`
	URL       string   `json:"url"`
	Events    []string `json:"events"`
	Enabled   bool     `json:"enabled"`
	CreatedBy string   `json:"createdBy"`
	CreatedAt string   `json:"createdAt"`
}

// WebhookDelivery is one event on its way to one endpoint.
type WebhookDelivery struct {
	ID          int64   `json:"id"`
	EndpointID  string  `json:"endpointId"`
	Event       string  `json:"event"`
	Status      string  `json:"status"`
	Attempts    int     `json:"attempts"`
	LastStatus  *int    `json:"lastStatus"`
	LastError   *string `json:"lastError"`
	CreatedAt   string  `json:"createdAt"`
	DeliveredAt *string `json:"deliveredAt"`
}

// NewWebhook is what the console sends to add an endpoint.
type NewWebhook struct {
	URL    string   `json:"url"`
	Events []string `json:"events"`
}

// IssuedWebhook carries the signing secret, once.
type IssuedWebhook struct {
	Endpoint WebhookEndpoint `json:"endpoint"`
	Secret   string          `json:"secret"`
}

func webhookSealContext(id string) string { return "webhook/" + id }

func (s *Integrations) newWebhookSecret(id string) (string, []byte, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, err
	}
	secret := "whsec_" + base64.RawURLEncoding.EncodeToString(raw)
	sealed, err := s.Vault.Seal(secret, webhookSealContext(id))
	return secret, sealed, err
}

const webhookColumns = `id, tenant_id, url, events, enabled, created_by, created_at`

func scanWebhook(row pgx.Row) (WebhookEndpoint, error) {
	var w WebhookEndpoint
	var at time.Time
	err := row.Scan(&w.ID, &w.TenantID, &w.URL, &w.Events, &w.Enabled, &w.CreatedBy, &at)
	w.CreatedAt = clock.Iso(at)
	return w, err
}

func (s *Integrations) checkWebhook(in NewWebhook) error {
	u, err := url.Parse(strings.TrimSpace(in.URL))
	if err != nil || u.Host == "" || (u.Scheme != "https" && !(s.AllowInternalWebhooks && u.Scheme == "http")) {
		return kernel.Invalid{Reason: "Enter a full https:// address."}
	}
	if len(in.Events) == 0 {
		return kernel.Invalid{Reason: "Choose at least one event."}
	}
	for _, e := range in.Events {
		if !slices.Contains(WebhookEvents, e) {
			return kernel.Invalid{Reason: "Unknown event: " + e}
		}
	}
	return nil
}

// ListWebhooks returns a tenant's endpoints and its latest deliveries.
func (s *Integrations) ListWebhooks(ctx context.Context, m kernel.Meta, tenantID string) ([]WebhookEndpoint, []WebhookDelivery, error) {
	if err := kernel.Access(m, tenantID); err != nil {
		return nil, nil, err
	}
	rows, err := s.DB.Pool.Query(ctx, `select `+webhookColumns+` from webhook_endpoints where tenant_id = $1 order by created_at desc, id`, tenantID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	endpoints := []WebhookEndpoint{}
	for rows.Next() {
		w, err := scanWebhook(rows)
		if err != nil {
			return nil, nil, err
		}
		endpoints = append(endpoints, w)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	sent, err := s.DB.Pool.Query(ctx, `select id, endpoint_id, event, status, attempts, last_status, last_error, created_at, delivered_at
		from webhook_deliveries where tenant_id = $1 order by id desc limit 50`, tenantID)
	if err != nil {
		return nil, nil, err
	}
	defer sent.Close()
	deliveries := []WebhookDelivery{}
	for sent.Next() {
		var d WebhookDelivery
		var at time.Time
		var done *time.Time
		if err := sent.Scan(&d.ID, &d.EndpointID, &d.Event, &d.Status, &d.Attempts, &d.LastStatus, &d.LastError, &at, &done); err != nil {
			return nil, nil, err
		}
		d.CreatedAt, d.DeliveredAt = clock.Iso(at), clock.IsoPtr(done)
		deliveries = append(deliveries, d)
	}
	return endpoints, deliveries, sent.Err()
}

// CreateWebhook adds an endpoint; the answer holds the only copy of the signing secret.
func (s *Integrations) CreateWebhook(ctx context.Context, m kernel.Meta, tenantID string, in NewWebhook) (*IssuedWebhook, error) {
	if err := kernel.Access(m, tenantID); err != nil {
		return nil, err
	}
	if err := s.checkWebhook(in); err != nil {
		return nil, err
	}
	id := ids.New("whk")
	secret, sealed, err := s.newWebhookSecret(id)
	if err != nil {
		return nil, err
	}
	var w WebhookEndpoint
	err = pgx.BeginFunc(ctx, s.DB.Pool, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `insert into webhook_endpoints (id, tenant_id, url, events, secret_sealed, created_by, created_at)
			values ($1, $2, $3, $4, $5, $6, $7) returning `+webhookColumns,
			id, tenantID, strings.TrimSpace(in.URL), in.Events, sealed, m.By(), m.At)
		var err error
		if w, err = scanWebhook(row); err != nil {
			return err
		}
		return kernel.LogCredential(ctx, tx, m, tenantID, "Webhook "+w.URL, "created")
	})
	if err != nil {
		return nil, err
	}
	return &IssuedWebhook{Endpoint: w, Secret: secret}, nil
}

// lockWebhook locks an endpoint's row and checks access to its tenant.
func lockWebhook(ctx context.Context, tx pgx.Tx, m kernel.Meta, id string) (WebhookEndpoint, error) {
	w, err := scanWebhook(tx.QueryRow(ctx, `select `+webhookColumns+` from webhook_endpoints where id = $1 for update`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return w, kernel.NotFound{What: "webhook endpoint"}
	}
	if err != nil {
		return w, err
	}
	return w, kernel.Access(m, w.TenantID)
}

// SetWebhookEnabled pauses or resumes an endpoint; pending deliveries wait while it is off.
func (s *Integrations) SetWebhookEnabled(ctx context.Context, m kernel.Meta, id string, enabled bool) (*WebhookEndpoint, error) {
	var w WebhookEndpoint
	err := pgx.BeginFunc(ctx, s.DB.Pool, func(tx pgx.Tx) error {
		var err error
		if w, err = lockWebhook(ctx, tx, m, id); err != nil {
			return err
		}
		if w.Enabled == enabled {
			return nil
		}
		if _, err := tx.Exec(ctx, `update webhook_endpoints set enabled = $2 where id = $1`, id, enabled); err != nil {
			return err
		}
		w.Enabled = enabled
		action := "paused"
		if enabled {
			action = "resumed"
		}
		return kernel.LogCredential(ctx, tx, m, w.TenantID, "Webhook "+w.URL, action)
	})
	if err != nil {
		return nil, err
	}
	return &w, nil
}

// RotateWebhook replaces the signing secret.
func (s *Integrations) RotateWebhook(ctx context.Context, m kernel.Meta, id string) (*IssuedWebhook, error) {
	secret, sealed, err := s.newWebhookSecret(id)
	if err != nil {
		return nil, err
	}
	var w WebhookEndpoint
	err = pgx.BeginFunc(ctx, s.DB.Pool, func(tx pgx.Tx) error {
		var err error
		if w, err = lockWebhook(ctx, tx, m, id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `update webhook_endpoints set secret_sealed = $2 where id = $1`, id, sealed); err != nil {
			return err
		}
		return kernel.LogCredential(ctx, tx, m, w.TenantID, "Webhook "+w.URL, "rotated")
	})
	if err != nil {
		return nil, err
	}
	return &IssuedWebhook{Endpoint: w, Secret: secret}, nil
}

// DeleteWebhook removes an endpoint and its deliveries.
func (s *Integrations) DeleteWebhook(ctx context.Context, m kernel.Meta, id string) error {
	return pgx.BeginFunc(ctx, s.DB.Pool, func(tx pgx.Tx) error {
		w, err := lockWebhook(ctx, tx, m, id)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `delete from webhook_endpoints where id = $1`, id); err != nil {
			return err
		}
		return kernel.LogCredential(ctx, tx, m, w.TenantID, "Webhook "+w.URL, "removed")
	})
}

// PingWebhook queues a test event for one endpoint.
func (s *Integrations) PingWebhook(ctx context.Context, m kernel.Meta, id string) error {
	return pgx.BeginFunc(ctx, s.DB.Pool, func(tx pgx.Tx) error {
		w, err := lockWebhook(ctx, tx, m, id)
		if err != nil {
			return err
		}
		payload, err := kernel.EventPayload(webhookPing, w.TenantID, m.At, map[string]string{"endpointId": id})
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `insert into webhook_deliveries (endpoint_id, tenant_id, event, payload, created_at) values ($1, $2, $3, $4, $5)`,
			id, w.TenantID, webhookPing, payload, m.At)
		return err
	})
}

// RetryDelivery sends a failed delivery again now.
func (s *Integrations) RetryDelivery(ctx context.Context, m kernel.Meta, id int64) error {
	var tenantID string
	if err := s.DB.Pool.QueryRow(ctx, `select tenant_id from webhook_deliveries where id = $1`, id).Scan(&tenantID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return kernel.NotFound{What: "delivery"}
		}
		return err
	}
	if err := kernel.Access(m, tenantID); err != nil {
		return err
	}
	_, err := s.DB.Pool.Exec(ctx, `update webhook_deliveries set status = 'pending', attempts = 0, next_attempt_at = now()
		where id = $1 and status = 'failed'`, id)
	return err
}

// --- delivery ---

// Sign returns the X-Commerce-Signature value: the HMAC-SHA256 of "<unix seconds>.<body>".
func Sign(secret string, unix int64, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	fmt.Fprintf(mac, "%d.", unix)
	mac.Write(body)
	return "t=" + strconv.FormatInt(unix, 10) + ",v1=" + hex.EncodeToString(mac.Sum(nil))
}

// DeliverDue sends what is due and reports how many it tried. Each claim pushes next_attempt_at out,
// so a crash mid-send retries later and two instances never send one delivery at once.
func (s *Integrations) DeliverDue(ctx context.Context) (int, error) {
	rows, err := s.DB.Pool.Query(ctx, `update webhook_deliveries d set next_attempt_at = now() + interval '2 minutes'
		from webhook_endpoints e
		where d.endpoint_id = e.id and d.id in (
			select x.id from webhook_deliveries x join webhook_endpoints y on y.id = x.endpoint_id
			where x.status = 'pending' and y.enabled and x.next_attempt_at <= now()
			order by x.id limit 20 for update of x skip locked)
		returning d.id, d.event, d.payload, d.attempts, e.id, e.url, e.secret_sealed`)
	if err != nil {
		return 0, err
	}
	type claim struct {
		id                int64
		event, endpointID string
		url               string
		payload, sealed   []byte
		attempts          int
	}
	var claims []claim
	for rows.Next() {
		var c claim
		if err := rows.Scan(&c.id, &c.event, &c.payload, &c.attempts, &c.endpointID, &c.url, &c.sealed); err != nil {
			rows.Close()
			return 0, err
		}
		claims = append(claims, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	for _, c := range claims {
		secret, err := s.Vault.Open(c.sealed, webhookSealContext(c.endpointID))
		code, sendErr := 0, err
		if err == nil {
			code, sendErr = s.post(ctx, c.url, c.event, c.id, secret, c.payload)
		}
		if err := s.recordAttempt(ctx, c.id, c.attempts+1, code, sendErr); err != nil {
			return len(claims), err
		}
	}
	return len(claims), nil
}

func (s *Integrations) post(ctx context.Context, target, event string, id int64, secret string, body []byte) (int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "CommerceOS-Webhooks/1")
	req.Header.Set("X-Commerce-Event", event)
	req.Header.Set("X-Commerce-Delivery", strconv.FormatInt(id, 10))
	req.Header.Set("X-Commerce-Signature", Sign(secret, time.Now().Unix(), body))
	res, err := s.HTTP.Do(req)
	if err != nil {
		return 0, errors.New("could not reach the endpoint")
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return res.StatusCode, fmt.Errorf("the endpoint answered %d", res.StatusCode)
	}
	return res.StatusCode, nil
}

func (s *Integrations) recordAttempt(ctx context.Context, id int64, attempts, code int, sendErr error) error {
	var status *int
	if code != 0 {
		status = &code
	}
	if sendErr == nil {
		_, err := s.DB.Pool.Exec(ctx, `update webhook_deliveries set status = 'delivered', attempts = $2, last_status = $3,
			last_error = null, delivered_at = $4 where id = $1`, id, attempts, status, s.Clock.Now())
		return err
	}
	message := sendErr.Error()
	if attempts > len(retryAfter) {
		_, err := s.DB.Pool.Exec(ctx, `update webhook_deliveries set status = 'failed', attempts = $2, last_status = $3, last_error = $4 where id = $1`,
			id, attempts, status, message)
		return err
	}
	_, err := s.DB.Pool.Exec(ctx, `update webhook_deliveries set attempts = $2, last_status = $3, last_error = $4, next_attempt_at = $5 where id = $1`,
		id, attempts, status, message, time.Now().Add(retryAfter[attempts-1]))
	return err
}
