package httpapi

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// --- reads for connected systems ---

// readable lists what an API key can read. Status filters only where the table has that column.
var readable = []struct {
	path, collection, scope, label string
	hasStatus, single              bool
	item                           any
}{
	{"/products", "products", "catalog:read", "products", true, true, domain.Product{}},
	{"/categories", "categories", "catalog:read", "categories", false, false, domain.Category{}},
	{"/collections", "collections", "catalog:read", "collections", false, false, domain.Collection{}},
	{"/modifiers", "modifiers", "catalog:read", "modifier groups", false, false, domain.ModifierGroup{}},
	{"/attributes", "attributes", "catalog:read", "attribute definitions", false, false, domain.AttributeDef{}},
	{"/warehouses", "warehouses", "inventory:read", "warehouses", false, false, domain.Warehouse{}},
	{"/stock", "stock", "inventory:read", "stock levels", false, false, domain.StockLevel{}},
	{"/orders", "orders", "orders:read", "orders", true, true, domain.Order{}},
	{"/customers", "customers", "customers:read", "customers", false, true, domain.Customer{}},
	{"/leads", "leads", "leads:read", "leads", false, true, domain.Lead{}},
	{"/tickets", "tickets", "tickets:read", "support tickets", true, true, domain.Ticket{}},
	{"/segments", "segments", "marketing:read", "segments", false, false, domain.Segment{}},
	{"/campaigns", "campaigns", "marketing:read", "campaigns", true, false, domain.Campaign{}},
	{"/promotions", "promotions", "marketing:read", "promotions", true, false, domain.Promotion{}},
	{"/sellers", "sellers", "store:read", "sellers", true, false, domain.Seller{}},
	{"/payment-types", "paymentTypes", "store:read", "payment types", false, false, domain.PaymentType{}},
}

// readTenant is the key's own tenant, or the ?tenantId a signed-in user may access.
func readTenant(r *http.Request) (string, error) {
	p, _ := auth.From(r.Context())
	if p.Kind == auth.KindAPIKey {
		return p.TenantIDs[0], nil
	}
	id := r.URL.Query().Get("tenantId")
	if id == "" {
		return "", service.Invalid{Reason: "Send tenantId in the query."}
	}
	if !p.CanAccess(id) {
		return "", service.Forbidden{TenantID: id}
	}
	return id, nil
}

const (
	defaultPageSize = 50
	maxPageSize     = 200
)

func (s *Server) listHandler(collection string, hasStatus bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := readTenant(r)
		if err != nil {
			s.writeError(w, r, err)
			return
		}
		q := r.URL.Query()
		page := store.PageQuery{TenantID: tenantID, Cursor: q.Get("cursor"), Limit: defaultPageSize}
		if v := q.Get("limit"); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil || n < 1 || n > maxPageSize {
				writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "limit takes a number from 1 to 200.")
				return
			}
			page.Limit = n
		}
		if hasStatus {
			page.Status = q.Get("status")
		}
		if v := q.Get("updatedSince"); v != "" {
			since, err := time.Parse(time.RFC3339, v)
			if err != nil {
				writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "updatedSince takes an RFC 3339 timestamp.")
				return
			}
			page.UpdatedSince = &since
		}
		items, next, err := store.Page(r.Context(), s.DB.Pool, collection, page)
		if err != nil {
			s.writeError(w, r, err)
			return
		}
		var cursor *string
		if next != "" {
			cursor = &next
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items, "nextCursor": cursor})
	}
}

func (s *Server) getHandler(collection string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := readTenant(r)
		if err != nil {
			s.writeError(w, r, err)
			return
		}
		// A row of another tenant reads as missing, so a key cannot probe ids. So does another
		// seller's order for a sales user.
		where, args := "id = $1 and tenant_id = $2", []any{r.PathValue("id"), tenantID}
		if collection == "orders" {
			p, _ := auth.From(r.Context())
			sellers, err := s.ownSellers(r.Context(), p)
			if err != nil {
				s.writeError(w, r, err)
				return
			}
			if sellers != nil {
				where, args = where+" and "+fmt.Sprintf(ownOrders, 3), append(args, sellers)
			}
		}
		rows, err := store.Raw(r.Context(), s.DB.Pool, collection, where, args...)
		if err != nil {
			s.writeError(w, r, err)
			return
		}
		if len(rows) == 0 {
			writeProblem(w, http.StatusNotFound, "NOT_FOUND", "not found")
			return
		}
		writeJSON(w, http.StatusOK, rows[0])
	}
}

// --- credentials ---

// writeSecret answers with material that must not sit in any cache.
func writeSecret(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, status, v)
}

func (s *Server) listCredentials(w http.ResponseWriter, r *http.Request) {
	credentials, trail, err := s.svc.ListCredentials(r.Context(), s.meta(r), r.PathValue("id"))
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, CredentialList{Credentials: credentials, Events: trail, Scopes: auth.Scopes})
}

// CredentialList is the credentials page's whole answer.
type CredentialList struct {
	Credentials []service.Credential      `json:"credentials"`
	Events      []service.CredentialEvent `json:"events"`
	Scopes      []auth.Scope              `json:"scopes"`
}

func (s *Server) createCredential(w http.ResponseWriter, r *http.Request) {
	var in service.NewCredential
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	issued, err := s.svc.CreateCredential(r.Context(), s.meta(r), r.PathValue("id"), in)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeSecret(w, http.StatusCreated, issued)
}

func (s *Server) rotateCredential(w http.ResponseWriter, r *http.Request) {
	issued, err := s.svc.RotateCredential(r.Context(), s.meta(r), r.PathValue("id"))
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeSecret(w, http.StatusOK, issued)
}

func (s *Server) revokeCredential(w http.ResponseWriter, r *http.Request) {
	c, err := s.svc.RevokeCredential(r.Context(), s.meta(r), r.PathValue("id"))
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) getConnectorCredentials(w http.ResponseWriter, r *http.Request) {
	c, err := s.svc.GetConnectorCredentials(r.Context(), s.meta(r), r.PathValue("id"))
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, c)
}

// ConnectorValuesInput sets connector values: a string replaces, null clears, a field left out stays.
type ConnectorValuesInput struct {
	Values map[string]*string `json:"values"`
}

func (s *Server) saveConnectorCredentials(w http.ResponseWriter, r *http.Request) {
	var in ConnectorValuesInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	c, err := s.svc.SaveConnectorCredentials(r.Context(), s.meta(r), r.PathValue("id"), in.Values)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) testConnector(w http.ResponseWriter, r *http.Request) {
	result, delta, err := s.svc.TestConnector(r.Context(), s.meta(r), r.PathValue("id"))
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if delta != nil {
		s.publish(delta)
	}
	writeJSON(w, http.StatusOK, result)
}

// --- webhooks ---

// WebhookList is the webhook card's whole answer.
type WebhookList struct {
	Endpoints  []service.WebhookEndpoint `json:"endpoints"`
	Deliveries []service.WebhookDelivery `json:"deliveries"`
	Events     []string                  `json:"events"`
}

func (s *Server) listWebhooks(w http.ResponseWriter, r *http.Request) {
	endpoints, deliveries, err := s.svc.ListWebhooks(r.Context(), s.meta(r), r.PathValue("id"))
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, WebhookList{Endpoints: endpoints, Deliveries: deliveries, Events: service.WebhookEvents})
}

func (s *Server) createWebhook(w http.ResponseWriter, r *http.Request) {
	var in service.NewWebhook
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	issued, err := s.svc.CreateWebhook(r.Context(), s.meta(r), r.PathValue("id"), in)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeSecret(w, http.StatusCreated, issued)
}

func (s *Server) setWebhookEnabled(w http.ResponseWriter, r *http.Request) {
	var in enabledInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	endpoint, err := s.svc.SetWebhookEnabled(r.Context(), s.meta(r), r.PathValue("id"), in.Enabled)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, endpoint)
}

func (s *Server) rotateWebhook(w http.ResponseWriter, r *http.Request) {
	issued, err := s.svc.RotateWebhook(r.Context(), s.meta(r), r.PathValue("id"))
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeSecret(w, http.StatusOK, issued)
}

// answerOk writes {ok: true} or the error.
func (s *Server) answerOk(w http.ResponseWriter, r *http.Request, err error) {
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, okResponse{Ok: true})
}

func (s *Server) pingWebhook(w http.ResponseWriter, r *http.Request) {
	s.answerOk(w, r, s.svc.PingWebhook(r.Context(), s.meta(r), r.PathValue("id")))
}

func (s *Server) deleteWebhook(w http.ResponseWriter, r *http.Request) {
	s.answerOk(w, r, s.svc.DeleteWebhook(r.Context(), s.meta(r), r.PathValue("id")))
}

func (s *Server) retryDelivery(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeProblem(w, http.StatusNotFound, "NOT_FOUND", "not found")
		return
	}
	s.answerOk(w, r, s.svc.RetryDelivery(r.Context(), s.meta(r), id))
}
