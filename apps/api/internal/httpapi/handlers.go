package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/readmodel"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// --- platform ---

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	dbOK := s.DB.Pool.Ping(ctx) == nil
	status := http.StatusOK
	if !dbOK {
		status = http.StatusServiceUnavailable
	}
	writeJSON(w, status, map[string]any{
		"ok": dbOK, "version": s.Version, "db": dbOK, "streams": s.Hub.Count(), "now": s.Clock.NowIso(),
	})
}

func (s *Server) tick(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.From(r.Context())
	if p.Role != "platform_admin" {
		writeProblem(w, http.StatusForbidden, "FORBIDDEN", "Only a platform admin runs the jobs by hand.")
		return
	}
	s.act(w, r, func(m service.Meta) (*service.Delta, error) { return s.svc.Tick(r.Context(), m.At) })
}

// RunTick is what the timer calls: the jobs, then a broadcast of what they changed.
func (s *Server) RunTick(ctx context.Context) error {
	s.currency.RefreshIfDue(ctx)
	d, err := s.svc.Tick(ctx, s.Clock.NowIso())
	if err != nil {
		return err
	}
	if !d.Empty() {
		s.publish(d)
	}
	return nil
}

// RunWebhooks sends the deliveries that are due; the timer calls it.
func (s *Server) RunWebhooks(ctx context.Context) error {
	_, err := s.svc.DeliverDue(ctx)
	return err
}

// --- auth ---

func (s *Server) userByEmail(ctx context.Context, email string) (domain.User, string, error) {
	var raw []byte
	var hash string
	err := s.DB.Pool.QueryRow(ctx, `select u.data, c.password_hash from users u
		join credentials c on c.user_id = u.id where u.email = $1`, strings.ToLower(strings.TrimSpace(email))).Scan(&raw, &hash)
	if err != nil {
		return domain.User{}, "", err
	}
	var u domain.User
	return u, hash, json.Unmarshal(raw, &u)
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	if !s.signInAllowed(w, r, in.Email) {
		return
	}
	u, hash, err := s.userByEmail(r.Context(), in.Email)
	known := err == nil && !u.Disabled
	if !known {
		hash = decoyHash()
	}
	if !auth.CheckPassword(hash, in.Password) || !known {
		// A constant answer for unknown emails and wrong passwords.
		writeProblem(w, http.StatusUnauthorized, "BAD_CREDENTIALS", "That email and password do not match.")
		return
	}
	s.issueUser(r.Context(), w, u)
}

func (s *Server) issueUser(ctx context.Context, w http.ResponseWriter, u domain.User) {
	p := auth.Principal{Kind: auth.KindUser, ID: u.ID, Role: u.Role, TenantIDs: u.TenantIDs}
	token, exp, err := s.Signer.Sign(p, time.Now())
	if err != nil {
		writeProblem(w, http.StatusInternalServerError, "INTERNAL", "Could not sign the token.")
		return
	}
	sellers, err := s.sellersOf(ctx, u.ID)
	if err != nil {
		writeProblem(w, http.StatusInternalServerError, "INTERNAL", "Could not read the seller profiles.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "expiresAt": exp.UTC().Format(time.RFC3339), "user": u, "sellers": sellers})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.From(r.Context())
	u, err := store.Get[domain.User](r.Context(), s.DB.Pool, "users", p.ID)
	if err != nil {
		writeProblem(w, http.StatusUnauthorized, "UNAUTHENTICATED", "This account no longer exists.")
		return
	}
	writeJSON(w, http.StatusOK, meResponse{User: u, EmailOn: s.notify.On()})
}

// meResponse says whether email is on, so the console knows to ask an owner to confirm theirs.
type meResponse struct {
	User    domain.User `json:"user"`
	EmailOn bool        `json:"emailOn"`
}

// demoAccounts lists the users the login page offers, when demo sign-in is on. The password is the
// shared demo password, so the response says so instead of carrying it.
func (s *Server) demoAccounts(w http.ResponseWriter, r *http.Request) {
	if !s.DemoLogin {
		writeProblem(w, http.StatusNotFound, "NOT_FOUND", "Demo sign-in is off.")
		return
	}
	users, err := store.List[domain.User](r.Context(), s.DB.Pool, "users", "")
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	tenants, err := store.List[domain.Tenant](r.Context(), s.DB.Pool, "tenants", "")
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	sellers, err := store.List[domain.Seller](r.Context(), s.DB.Pool, "sellers", "")
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	users, tenants, sellers = withoutSignUps(users, tenants, sellers)
	writeJSON(w, http.StatusOK, map[string]any{"users": users, "tenants": tenants, "sellers": sellers, "passwordHint": "the shared demo password"})
}

// withoutSignUps drops the stores people made at sign-up, and the people and sellers who belong only
// to them: those are real accounts, not demo ones.
func withoutSignUps(users []domain.User, tenants []domain.Tenant, sellers []domain.Seller) ([]domain.User, []domain.Tenant, []domain.Seller) {
	signedUp := map[string]bool{}
	for _, t := range tenants {
		if t.Source == "signup" {
			signedUp[t.ID] = true
		}
	}
	if len(signedUp) == 0 {
		return users, tenants, sellers
	}
	tenants = slices.DeleteFunc(tenants, func(t domain.Tenant) bool { return signedUp[t.ID] })
	sellers = slices.DeleteFunc(sellers, func(s domain.Seller) bool { return signedUp[s.TenantID] })
	users = slices.DeleteFunc(users, func(u domain.User) bool {
		return len(u.TenantIDs) > 0 && !slices.ContainsFunc(u.TenantIDs, func(id string) bool { return !signedUp[id] })
	})
	return users, tenants, sellers
}

// shops lists every tenant, for the storefront's brand chooser.
func (s *Server) shops(w http.ResponseWriter, r *http.Request) {
	tenants, err := store.List[domain.Tenant](r.Context(), s.DB.Pool, "tenants", "")
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	pages, err := store.List[domain.Page](r.Context(), s.DB.Pool, "pages", "")
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	live := make([]domain.Tenant, 0, len(tenants))
	for _, tenant := range tenants {
		if storeLive(tenant, pages) {
			live = append(live, tenant)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"tenants": live, "now": s.Clock.NowIso()})
}

func storeLive(t domain.Tenant, pages []domain.Page) bool {
	for _, page := range pages {
		if page.TenantID == t.ID && page.Kind == "home" && page.Status == "published" {
			return true
		}
	}
	return false
}

// --- state ---

// tenantScope is the tenants a user token may read.
func (s *Server) tenantScope(ctx context.Context, p auth.Principal) ([]string, error) {
	if p.Role != "platform_admin" {
		return p.TenantIDs, nil
	}
	rows, err := s.DB.Pool.Query(ctx, `select id from tenants order by id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// loadState reads the collections for a set of tenants; users and tenants rows come whole. With
// sellers set, the collections that carry order figures hold only those sellers' own.
func (s *Server) loadState(ctx context.Context, tenantIDs, sellers []string, collections []string) (map[string][]json.RawMessage, error) {
	out := map[string][]json.RawMessage{}
	tenantWhere, tenantArgs := store.TenantIn(tenantIDs)
	for _, c := range collections {
		var rows []json.RawMessage
		var err error
		where, args := tenantWhere, tenantArgs
		if sellers != nil && len(tenantArgs) == 1 {
			if clause, extra, ok := limitState(c, sellers); ok {
				where, args = where+" and "+clause, append(slices.Clone(tenantArgs), extra...)
			}
		}
		switch c {
		case "orders":
			// Only orders still under way: the queues, notifications and badges work on these. Every
			// other order is one query away (GET /views/orders, GET /orders/{id}). Each carries only the
			// shipment from its history; a detail reads the whole order.
			rows, err = store.Raw(ctx, s.DB.Pool, c, where+" and status in ('new', 'confirmed', 'paid', 'processing', 'packed', 'shipped')", args...)
			if err == nil {
				err = withShipmentsOnly(rows)
			}
		case readmodel.CustomerMetricsCollection:
			rows, err = readmodel.CustomerMetricsRows(ctx, s.DB.Pool, where, args...)
		case readmodel.SalesDaysCollection, readmodel.ProductDaysCollection, readmodel.SellerBuyersCollection:
			rows, err = readmodel.FactRows(ctx, s.DB.Pool, c, where, args...)
		case "users":
			// Colleagues and platform admins; staff of other brands stay out of this browser.
			rows, err = store.Raw(ctx, s.DB.Pool, c, "data->'tenantIds' ?| $1 or data->>'role' = 'platform_admin'", tenantIDs)
		case "tenants":
			rows, err = store.Raw(ctx, s.DB.Pool, c, "id = any($1)", tenantIDs)
		case "templates":
			rows, err = store.Raw(ctx, s.DB.Pool, c, "tenant_id is null or tenant_id = any($1)", tenantIDs)
		default:
			rows, err = store.Raw(ctx, s.DB.Pool, c, where, args...)
		}
		if err != nil {
			return nil, fmt.Errorf("load %s: %w", c, err)
		}
		if rows == nil {
			rows = []json.RawMessage{}
		}
		out[c] = rows
	}
	return out, nil
}

// stateCollections is what a signed-in console loads at once. Customer history is left out: screens
// read it through GET /views/customer-events, a page at a time. Customer metrics come from their read
// model in its place, so segment rules and customer lists need neither the history nor every order.
var stateCollections = append(slices.DeleteFunc(slices.Clone(store.Collections), func(c string) bool { return c == "customerEvents" }),
	readmodel.Collections...)

// withShipmentsOnly trims each order's history to its shipped events, the part lists and the
// dashboard read. The rest is half of an order's size.
func withShipmentsOnly(rows []json.RawMessage) error {
	for i, raw := range rows {
		var order map[string]json.RawMessage
		if err := json.Unmarshal(raw, &order); err != nil {
			return err
		}
		var history []struct {
			Status *string `json:"status"`
		}
		if err := json.Unmarshal(order["events"], &history); err != nil {
			return err
		}
		var all []json.RawMessage
		if err := json.Unmarshal(order["events"], &all); err != nil {
			return err
		}
		kept := []json.RawMessage{}
		for j, e := range history {
			if e.Status != nil && *e.Status == "shipped" {
				kept = append(kept, all[j])
			}
		}
		trimmed, err := json.Marshal(kept)
		if err != nil {
			return err
		}
		order["events"] = trimmed
		if rows[i], err = json.Marshal(order); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) state(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.From(r.Context())
	ids, err := s.tenantScope(r.Context(), p)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	sellers, err := s.ownSellers(r.Context(), p)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	state, err := s.loadState(r.Context(), ids, sellers, stateCollections)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if p.Role != "platform_admin" {
		if state["users"], err = withoutAdminContacts(state["users"]); err != nil {
			s.writeError(w, r, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"state": state, "now": s.Clock.NowIso()})
}

// stream serves one subscriber until the client leaves.
func (s *Server) stream(w http.ResponseWriter, r *http.Request, scope events.Scope) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeProblem(w, http.StatusInternalServerError, "INTERNAL", "Streaming is not supported here.")
		return
	}
	ch, leave := s.Hub.Subscribe(scope)
	defer leave()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "event: hello\ndata: {\"now\":%q}\n\n", s.Clock.NowIso())
	flusher.Flush()
	keepAlive := time.NewTicker(25 * time.Second)
	defer keepAlive.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-keepAlive.C:
			fmt.Fprint(w, ": keep-alive\n\n")
			flusher.Flush()
		case data := <-ch:
			fmt.Fprintf(w, "event: delta\ndata: %s\n\n", data)
			flusher.Flush()
		}
	}
}

func (s *Server) userEvents(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.From(r.Context())
	ids, err := s.tenantScope(r.Context(), p)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	scope := events.Scope{TenantIDs: ids}
	sellers, err := s.ownSellers(r.Context(), p)
	if err == nil && sellers != nil {
		scope, err = s.sellerStreamScope(r.Context(), ids, sellers)
	}
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	s.stream(w, r, scope)
}

func (s *Server) placeOrder(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Order    domain.Order     `json:"order"`
		Customer *domain.Customer `json:"customer"`
	}
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	s.act(w, r, func(m service.Meta) (*service.Delta, error) {
		return s.svc.PlaceOrder(r.Context(), m, in.Order, in.Customer)
	})
}

// --- storefront ---

// shopCollections is the part of the dataset a storefront reads; customers and orders come only
// through the signed-in shopper's own endpoint.
var shopCollections = []string{
	"tenants", "sellers", "templates", "pages", "categories", "attributes", "modifiers", "collections",
	"products", "warehouses", "stock", "modifierStock", "promotions", "paymentTypes", "agentPolicies",
}

func shopScope(tenantID string) events.Scope {
	visible := map[string]bool{}
	for _, c := range shopCollections {
		visible[c] = true
	}
	return events.Scope{TenantIDs: []string{tenantID}, Collections: visible}
}

func (s *Server) storeTenant(r *http.Request) (domain.Tenant, error) {
	rows, err := store.List[domain.Tenant](r.Context(), s.DB.Pool, "tenants", "subdomain = $1", r.PathValue("store"))
	if err != nil {
		return domain.Tenant{}, err
	}
	if len(rows) == 0 {
		return domain.Tenant{}, service.NotFound{What: "store"}
	}
	pages, err := store.List[domain.Page](r.Context(), s.DB.Pool, "pages", "tenant_id = $1", rows[0].ID)
	if err != nil {
		return domain.Tenant{}, err
	}
	if !storeLive(rows[0], pages) {
		return domain.Tenant{}, service.NotFound{What: "store"}
	}
	return rows[0], nil
}

func (s *Server) shopState(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	state, err := s.loadState(r.Context(), []string{tenant.ID}, nil, shopCollections)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	online, err := s.svc.OnlinePaymentTypes(r.Context(), tenant.ID)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	rates, err := s.currency.ForShop(r.Context(), tenant.DisplayCurrencies)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"state": state, "now": s.Clock.NowIso(), "onlinePayments": online, "currencyRates": rates})
}

func (s *Server) shopEvents(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	scope := shopScope(tenant.ID)
	// A signed-in shopper also hears about their own orders and account, so a payment that lands
	// while the order page is open shows at once. cmd/shop has no signer and streams the store only.
	if s.Signer != nil {
		if p, ok := s.shopper(r, tenant.ID); ok {
			scope.Collections["orders"], scope.Collections["customers"] = true, true
			scope.Keep = ownRows(p.ID)
		}
	}
	s.stream(w, r, scope)
}

// ownRows keeps a shopper's own orders and customer record, and every row of the other collections.
func ownRows(customerID string) func(string, json.RawMessage) bool {
	return func(collection string, data json.RawMessage) bool {
		var row struct {
			ID         string `json:"id"`
			CustomerID string `json:"customerId"`
		}
		switch collection {
		case "orders":
			return json.Unmarshal(data, &row) == nil && row.CustomerID == customerID
		case "customers":
			return json.Unmarshal(data, &row) == nil && row.ID == customerID
		}
		return true
	}
}

func (s *Server) demoCustomers(w http.ResponseWriter, r *http.Request) {
	if !s.DemoLogin {
		writeProblem(w, http.StatusNotFound, "NOT_FOUND", "Demo sign-in is off.")
		return
	}
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	rows, err := store.Raw(r.Context(), s.DB.Pool, "customers", "tenant_id = $1", tenant.ID)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if len(rows) > 12 {
		rows = rows[:12]
	}
	writeJSON(w, http.StatusOK, map[string]any{"customers": rows})
}

// shopper reads the customer token, if the request carries one for this store.
func (s *Server) shopper(r *http.Request, tenantID string) (auth.Principal, bool) {
	p, ok := s.principal(r)
	if !ok || p.Kind != auth.KindCustomer || p.TenantID != tenantID {
		return auth.Principal{}, false
	}
	return p, true
}

func (s *Server) shopSignIn(w http.ResponseWriter, r *http.Request) {
	if !s.DemoLogin {
		writeProblem(w, http.StatusNotFound, "NOT_FOUND", "Demo sign-in is off.")
		return
	}
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	var in struct {
		CustomerID string `json:"customerId"`
	}
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	c, err := store.Get[domain.Customer](r.Context(), s.DB.Pool, "customers", in.CustomerID)
	if err != nil || c.TenantID != tenant.ID {
		writeProblem(w, http.StatusNotFound, "NOT_FOUND", "That shopper does not exist at this store.")
		return
	}
	p := auth.Principal{Kind: auth.KindCustomer, ID: c.ID, TenantID: tenant.ID}
	token, exp, err := s.Signer.Sign(p, time.Now())
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "expiresAt": exp.UTC().Format(time.RFC3339), "customer": c})
}

func (s *Server) shopMe(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	p, ok := s.shopper(r, tenant.ID)
	if !ok {
		writeProblem(w, http.StatusUnauthorized, "UNAUTHENTICATED", "Sign in to see your account.")
		return
	}
	customer, err := store.Get[domain.Customer](r.Context(), s.DB.Pool, "customers", p.ID)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	orders, err := store.List[domain.Order](r.Context(), s.DB.Pool, "orders", "customer_id = $1", p.ID)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	sort.Slice(orders, func(i, j int) bool { return orders[i].CreatedAt > orders[j].CreatedAt })
	var hasPassword, verified bool
	if err := s.DB.Pool.QueryRow(r.Context(), `select count(*) > 0, coalesce(bool_or(email_verified_at is not null), false)
		from customer_credentials where customer_id = $1`, p.ID).Scan(&hasPassword, &verified); err != nil {
		s.writeError(w, r, err)
		return
	}
	payments, err := s.shopPayments(r, orders)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"customer": customer, "orders": orders, "payments": payments, "hasPassword": hasPassword, "emailVerified": verified, "emailOn": s.notify.On()})
}

func (s *Server) shopPrice(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	var in struct {
		Lines         []rules.PricedLine `json:"lines"`
		Code          string             `json:"code"`
		PaymentTypeID string             `json:"paymentTypeId"`
		SellerID      string             `json:"sellerId"`
	}
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	promotions, err := store.ListTenant[domain.Promotion](r.Context(), s.DB.Pool, "promotions", tenant.ID)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	categories, err := store.ListTenant[domain.Category](r.Context(), s.DB.Pool, "categories", tenant.ID)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	price := rules.PriceCart(rules.CartContext{
		Lines: in.Lines, Promotions: promotions, Categories: categories, Code: in.Code,
		PaymentTypeID: in.PaymentTypeID, SellerID: in.SellerID, Now: s.Clock.Now().UnixMilli(),
	})
	writeJSON(w, http.StatusOK, price)
}

// shopPrincipal is the shopper's token, or an anonymous guest of the store for guest checkout.
func (s *Server) shopPrincipal(r *http.Request, tenantID string) auth.Principal {
	if p, ok := s.shopper(r, tenantID); ok {
		return p
	}
	return auth.Principal{Kind: auth.KindCustomer, ID: "guest", TenantID: tenantID}
}

func (s *Server) shopPlaceOrder(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	var in struct {
		Order    domain.Order     `json:"order"`
		Customer *domain.Customer `json:"customer"`
	}
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	if in.Order.TenantID != tenant.ID || (in.Customer != nil && in.Customer.TenantID != tenant.ID) {
		writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "The order belongs to another store.")
		return
	}
	p := s.shopPrincipal(r, tenant.ID)
	// A signed-in shopper orders for themselves; a guest must bring the new customer record.
	if p.ID != "guest" && in.Order.CustomerID != p.ID {
		writeProblem(w, http.StatusForbidden, "FORBIDDEN", "You can only place orders for your own account.")
		return
	}
	if p.ID == "guest" && in.Customer == nil {
		writeProblem(w, http.StatusUnauthorized, "UNAUTHENTICATED", "Sign in, or check out as a new customer.")
		return
	}
	// The token below goes to whoever names this id, so a guest may only name a new one.
	if p.ID == "guest" {
		if _, err := store.Get[domain.Customer](r.Context(), s.DB.Pool, "customers", in.Customer.ID); err == nil {
			writeProblem(w, http.StatusConflict, "ACCOUNT_EXISTS", "This customer already exists. Sign in to order for them.")
			return
		}
	}
	d, err := s.svc.PlaceOrder(r.Context(), service.Meta{P: p, At: s.Clock.NowIso()}, in.Order, in.Customer)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	out := s.publish(d)
	s.startPayment(r, tenant, in.Order.ID, out)
	// A new customer gets their token with the receipt, so the account page works right away.
	if in.Customer != nil && p.ID == "guest" {
		cp := auth.Principal{Kind: auth.KindCustomer, ID: in.Customer.ID, TenantID: tenant.ID}
		if token, _, err := s.Signer.Sign(cp, time.Now()); err == nil {
			out["token"] = token
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) shopLead(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	var lead domain.Lead
	if err := decode(r, &lead); err != nil {
		s.writeError(w, r, err)
		return
	}
	if lead.TenantID != tenant.ID {
		writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "The lead belongs to another store.")
		return
	}
	// Leads from the storefront never arrive through the console; a guest cannot overwrite one.
	if _, err := store.Get[domain.Lead](r.Context(), s.DB.Pool, "leads", lead.ID); err == nil {
		writeProblem(w, http.StatusConflict, "REFUSED", "This lead was already sent.")
		return
	} else if !errors.Is(err, store.ErrNotFound) && !errors.Is(err, pgx.ErrNoRows) {
		s.writeError(w, r, err)
		return
	}
	p := s.shopPrincipal(r, tenant.ID)
	d, err := s.svc.SaveLead(r.Context(), service.Meta{P: p, At: s.Clock.NowIso()}, lead)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, s.publish(d))
}

// withoutAdminContacts keeps platform admins in a brand's state so screens can name who changed
// what, but drops their email: anyone can sign up for a brand, and the address is no business of theirs.
func withoutAdminContacts(rows []json.RawMessage) ([]json.RawMessage, error) {
	for i, raw := range rows {
		var u domain.User
		if err := json.Unmarshal(raw, &u); err != nil {
			return nil, err
		}
		if u.Role != "platform_admin" {
			continue
		}
		out, err := json.Marshal(domain.User{ID: u.ID, Name: u.Name, Title: u.Title, Role: u.Role, Color: u.Color, TenantIDs: []string{}})
		if err != nil {
			return nil, err
		}
		rows[i] = out
	}
	return rows, nil
}
