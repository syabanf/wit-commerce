package httpapi

import (
	"context"
	"net/http"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

// Route is one endpoint, listed at GET /api/v1/routes so the contract is readable without a browser.
type Route struct {
	Method     string `json:"method"`
	Path       string `json:"path"`
	Action     string `json:"action,omitempty"`
	Permission string `json:"permission,omitempty"`
	Scope      string `json:"scope,omitempty"`
	Summary    string `json:"summary"`
}

const prefix = "/api/v1"

func (s *Server) routes(mux *http.ServeMux) {
	var table []Route
	add := func(method, path, action, permission, summary string, h http.HandlerFunc) {
		table = append(table, Route{
			Method: method, Path: prefix + path, Action: action, Permission: permission,
			Scope: auth.ScopeFor(permission), Summary: summary,
		})
		if permission != "" || action == "system/tick" {
			h = s.user(permission, h)
		}
		mux.HandleFunc(method+" "+prefix+path, h)
	}

	// Platform
	add("GET", "/health", "", "", "Liveness, database and event stream counts", s.health)
	add("GET", "/openapi.json", "", "", "This API as an OpenAPI 3.0 document", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write(s.spec)
	})
	add("GET", "/docs", "", "", "Reference documentation for this API", serveDocs)
	add("GET", "/routes", "", "", "This table", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"routes": table})
	})
	add("POST", "/auth/login", "", "", "Email and password → bearer token", s.login)
	add("GET", "/auth/me", "", "", "The signed-in user", s.user("", s.me))
	add("POST", "/auth/password", "", "", "Change the signed-in user's password", s.user("", s.changePassword))
	add("POST", "/users", "", "user.manage", "Add a staff member; answers with a temporary password", s.createStaff)
	add("PUT", "/users/{id}", "", "user.manage", "Change a staff member's name, title, role or brands", s.updateStaff)
	add("POST", "/users/{id}/status", "", "user.manage", "Disable or enable a staff member", s.setStaffStatus)
	add("POST", "/users/{id}/reset-password", "", "user.manage", "Issue a temporary password and end the person's sessions", s.resetStaffPassword)
	add("GET", "/auth/demo-accounts", "", "", "Demo accounts for the login page (demo mode only)", s.demoAccounts)
	add("GET", "/state", "", "", "The dataset scoped to the user's tenants", s.user("", s.state))
	add("GET", "/events", "", "", "Server-sent events: every delta in the user's tenants", s.user("", s.userEvents))
	add("POST", "/system/tick", "system/tick", "", "Run the timed jobs now (platform admin)", s.tick)

	// Tenants and brand
	add("POST", "/tenants", "tenants/create", "tenant.manage", "Create a tenant", body(s, s.svc.CreateTenant))
	add("POST", "/tenants/{id}/onboarding/{step}", "tenants/completeStep", "brand.manage", "Mark an onboarding step done", func(w http.ResponseWriter, r *http.Request) {
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.CompleteOnboardingStep(r.Context(), m, r.PathValue("id"), r.PathValue("step"))
		})
	})
	add("PUT", "/tenants/{id}/brand", "brand/update", "brand.manage", "Replace the brand guideline", func(w http.ResponseWriter, r *http.Request) {
		var brand domain.BrandConfig
		if err := decode(r, &brand); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.UpdateBrand(r.Context(), m, r.PathValue("id"), brand)
		})
	})
	add("POST", "/tenants/{id}/brand/locks/{key}/toggle", "brand/toggleLock", "brand.manage", "Lock or unlock a brand setting", func(w http.ResponseWriter, r *http.Request) {
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.ToggleBrandLock(r.Context(), m, r.PathValue("id"), r.PathValue("key"))
		})
	})
	add("PUT", "/tenants/{id}/agent-policy", "agentPolicy/save", "store.manage", "Replace the buying-agent policy", func(w http.ResponseWriter, r *http.Request) {
		var p domain.AgentPolicy
		if err := decode(r, &p); err != nil {
			s.writeError(w, r, err)
			return
		}
		p.TenantID = r.PathValue("id")
		s.act(w, r, func(m service.Meta) (*service.Delta, error) { return s.svc.SaveAgentPolicy(r.Context(), m, p) })
	})

	// Catalog
	add("PUT", "/products/{id}", "products/save", "product.manage", "Create or replace a product", upsert(s, func(m service.Meta, r *http.Request, p domain.Product) (*service.Delta, error) {
		return s.svc.SaveProduct(r.Context(), m, p)
	}))
	add("PUT", "/products/{id}/attributes", "products/setAttributes", "product.manage", "Replace a product's attribute values", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Attributes map[string]string `json:"attributes"`
		}
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.SetProductAttributes(r.Context(), m, r.PathValue("id"), in.Attributes)
		})
	})
	add("POST", "/products/{id}/status", "products/setStatus", "product.manage", "Draft, schedule, activate or archive a product", status(s, s.svc.SetProductStatus))
	add("PUT", "/categories/{id}", "categories/save", "product.manage", "Create or replace a category", upsert(s, func(m service.Meta, r *http.Request, c domain.Category) (*service.Delta, error) {
		return s.svc.SaveCategory(r.Context(), m, c)
	}))
	add("DELETE", "/categories/{id}", "categories/remove", "product.manage", "Remove an unused category", idOnly(s, s.svc.RemoveCategory))
	add("PUT", "/attributes/{id}", "attributes/save", "product.manage", "Create or replace an attribute definition", upsert(s, func(m service.Meta, r *http.Request, a domain.AttributeDef) (*service.Delta, error) {
		return s.svc.SaveAttribute(r.Context(), m, a)
	}))
	add("DELETE", "/attributes/{id}", "attributes/remove", "product.manage", "Remove an attribute; products drop its value", idOnly(s, s.svc.RemoveAttribute))
	add("PUT", "/modifiers/{id}", "modifiers/save", "product.manage", "Create or replace a modifier group", upsert(s, func(m service.Meta, r *http.Request, g domain.ModifierGroup) (*service.Delta, error) {
		return s.svc.SaveModifierGroup(r.Context(), m, g)
	}))
	add("DELETE", "/modifiers/{id}", "modifiers/remove", "product.manage", "Remove a modifier group without stock", idOnly(s, s.svc.RemoveModifierGroup))
	add("PUT", "/collections/{id}", "collections/save", "product.manage", "Create or replace a collection", upsert(s, func(m service.Meta, r *http.Request, c domain.Collection) (*service.Delta, error) {
		return s.svc.SaveCollection(r.Context(), m, c)
	}))
	add("DELETE", "/collections/{id}", "collections/remove", "product.manage", "Remove a collection", idOnly(s, s.svc.RemoveCollection))
	add("PUT", "/payment-types/{id}", "paymentTypes/save", "integration.manage", "Create or replace a payment type", upsert(s, func(m service.Meta, r *http.Request, p domain.PaymentType) (*service.Delta, error) {
		return s.svc.SavePaymentType(r.Context(), m, p)
	}))
	add("POST", "/payment-types/{id}/toggle", "paymentTypes/toggle", "integration.manage", "Turn a payment type on or off", idOnly(s, s.svc.TogglePaymentType))

	// Stock
	add("POST", "/stock/{id}/adjust", "stock/adjust", "inventory.manage", "Adjust a stock level", adjust(s, s.svc.AdjustStock))
	add("POST", "/stock/receive", "stock/receive", "inventory.manage", "Receive units of a variant", receive(s, s.svc.ReceiveStock))
	add("POST", "/modifier-stock/{id}/adjust", "modifierStock/adjust", "inventory.manage", "Adjust a modifier stock level", adjust(s, s.svc.AdjustModifierStock))
	add("POST", "/modifier-stock/receive", "modifierStock/receive", "inventory.manage", "Receive units of a modifier option", receive(s, s.svc.ReceiveModifierStock))

	// Orders
	add("POST", "/orders", "orders/place", "order.fulfil", "Place an order on a customer's behalf", s.placeOrder)
	add("POST", "/orders/{id}/advance", "orders/advance", "order.fulfil", "Move an order to its next step", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			TrackingNo *string `json:"trackingNo"`
		}
		if r.ContentLength != 0 {
			if err := decode(r, &in); err != nil {
				s.writeError(w, r, err)
				return
			}
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.AdvanceOrder(r.Context(), m, r.PathValue("id"), in.TrackingNo)
		})
	})
	add("POST", "/orders/{id}/cancel", "orders/cancel", "order.fulfil", "Cancel an order; paid ones are refunded", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Reason string `json:"reason"`
			Note   string `json:"note"`
		}
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.CancelOrder(r.Context(), m, r.PathValue("id"), in.Reason, in.Note)
		})
	})
	add("POST", "/orders/{id}/refund", "orders/refund", "order.refund", "Refund part or all of a paid order", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Amount int    `json:"amount"`
			Note   string `json:"note"`
		}
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.RefundOrder(r.Context(), m, r.PathValue("id"), in.Amount, in.Note)
		})
	})
	add("POST", "/orders/{id}/notes", "orders/note", "order.fulfil", "Add a note to an order's timeline", note(s, s.svc.NoteOrder))

	// Customers and CRM
	add("PUT", "/customers/{id}", "customers/save", "customer.manage", "Create or replace a customer", upsert(s, func(m service.Meta, r *http.Request, c domain.Customer) (*service.Delta, error) {
		return s.svc.SaveCustomer(r.Context(), m, c)
	}))
	add("POST", "/customers/{id}/notes", "customers/note", "customer.manage", "Add a note to a customer's timeline", note(s, s.svc.NoteCustomer))
	add("POST", "/customers/{id}/points", "customers/addPoints", "customer.manage", "Add or take loyalty points", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Points int    `json:"points"`
			Reason string `json:"reason"`
		}
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.AddPoints(r.Context(), m, r.PathValue("id"), in.Points, in.Reason)
		})
	})
	add("PUT", "/segments/{id}", "segments/save", "segment.manage", "Create or replace a segment", upsert(s, func(m service.Meta, r *http.Request, seg domain.Segment) (*service.Delta, error) {
		return s.svc.SaveSegment(r.Context(), m, seg)
	}))
	add("DELETE", "/segments/{id}", "segments/remove", "segment.manage", "Remove a segment no campaign uses", idOnly(s, s.svc.RemoveSegment))
	add("PUT", "/leads/{id}", "leads/save", "lead.manage", "Create or replace a lead", upsert(s, func(m service.Meta, r *http.Request, l domain.Lead) (*service.Delta, error) {
		return s.svc.SaveLead(r.Context(), m, l)
	}))
	add("POST", "/leads/{id}/stage", "leads/move", "lead.manage", "Move a lead through the pipeline", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Stage      string  `json:"stage"`
			LostReason *string `json:"lostReason"`
		}
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.MoveLead(r.Context(), m, r.PathValue("id"), in.Stage, in.LostReason)
		})
	})
	add("POST", "/tickets/{id}/assign", "tickets/assign", "ticket.manage", "Assign a ticket", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			AssigneeID *string `json:"assigneeId"`
		}
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.AssignTicket(r.Context(), m, r.PathValue("id"), in.AssigneeID)
		})
	})
	add("POST", "/tickets/{id}/resolve", "tickets/resolve", "ticket.manage", "Resolve a ticket", idOnly(s, s.svc.ResolveTicket))

	// Growth
	add("PUT", "/campaigns/{id}", "campaigns/save", "campaign.manage", "Create or replace a campaign", upsert(s, func(m service.Meta, r *http.Request, c domain.Campaign) (*service.Delta, error) {
		return s.svc.SaveCampaign(r.Context(), m, c)
	}))
	add("POST", "/campaigns/{id}/launch", "campaigns/launch", "campaign.manage", "Launch a campaign", idOnly(s, s.svc.LaunchCampaign))
	add("POST", "/campaigns/{id}/pause", "campaigns/pause", "campaign.manage", "Pause a running campaign", idOnly(s, s.svc.PauseCampaign))
	add("PUT", "/automations/{id}", "automations/save", "automation.manage", "Create or replace an automation", upsert(s, func(m service.Meta, r *http.Request, a domain.Automation) (*service.Delta, error) {
		return s.svc.SaveAutomation(r.Context(), m, a)
	}))
	add("POST", "/automations/{id}/status", "automations/setStatus", "automation.manage", "Draft, activate or pause an automation", status(s, s.svc.SetAutomationStatus))
	add("PUT", "/promotions/{id}", "promotions/save", "promotion.manage", "Create or replace a promotion", upsert(s, func(m service.Meta, r *http.Request, p domain.Promotion) (*service.Delta, error) {
		return s.svc.SavePromotion(r.Context(), m, p)
	}))
	add("POST", "/promotions/{id}/status", "promotions/setStatus", "promotion.manage", "Change a promotion's status", status(s, s.svc.SetPromotionStatus))

	// Pages and sellers
	add("POST", "/pages", "pages/create", "store.manage", "Create a page", body(s, s.svc.CreatePage))
	add("PUT", "/pages/{id}", "pages/save", "store.manage", "Save page content as a new revision", func(w http.ResponseWriter, r *http.Request) {
		var in service.SavePageInput
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.SavePage(r.Context(), m, r.PathValue("id"), in)
		})
	})
	add("POST", "/pages/{id}/template", "pages/setTemplate", "store.manage", "Lay the page out with another template", templateOf(s, s.svc.SetPageTemplate))
	add("POST", "/pages/{id}/publish", "pages/publish", "store.manage", "Publish a page", idOnly(s, s.svc.PublishPage))
	add("POST", "/pages/{id}/schedule", "pages/schedule", "store.manage", "Schedule a page", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			At string `json:"at"`
		}
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.SchedulePage(r.Context(), m, r.PathValue("id"), in.At)
		})
	})
	add("POST", "/pages/{id}/unpublish", "pages/unpublish", "store.manage", "Take a page back to draft", idOnly(s, s.svc.UnpublishPage))
	add("POST", "/pages/{id}/rollback", "pages/rollback", "store.manage", "Restore a revision", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			RevisionID string `json:"revisionId"`
		}
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.RollbackPage(r.Context(), m, r.PathValue("id"), in.RevisionID)
		})
	})
	add("PUT", "/sellers/{id}", "sellers/save", "seller.manage", "Create or replace a seller; their page follows", upsert(s, func(m service.Meta, r *http.Request, seller domain.Seller) (*service.Delta, error) {
		return s.svc.SaveSeller(r.Context(), m, seller)
	}))
	add("POST", "/sellers/{id}/template", "sellers/setTemplate", "seller.manage", "Give a seller another allowed template", templateOf(s, s.svc.SetSellerTemplate))
	add("POST", "/sellers/{id}/status", "sellers/setStatus", "seller.manage", "Activate, invite or suspend a seller", status(s, s.svc.SetSellerStatus))

	// Integrations
	add("POST", "/integrations/{id}/toggle", "integrations/toggle", "integration.manage", "Turn an integration on or off", idOnly(s, s.svc.ToggleIntegration))
	add("POST", "/integrations/{id}/sync", "integrations/sync", "integration.manage", "Sync an integration now", idOnly(s, s.svc.SyncIntegration))

	// Reads for connected systems, paged by id
	for _, c := range readable {
		table = append(table, Route{Method: "GET", Path: prefix + c.path, Scope: c.scope, Summary: "List " + c.label})
		mux.HandleFunc("GET "+prefix+c.path, s.reader(c.scope, s.listHandler(c.collection, c.hasStatus)))
		if c.single {
			table = append(table, Route{Method: "GET", Path: prefix + c.path + "/{id}", Scope: c.scope, Summary: "Read one of " + c.label})
			mux.HandleFunc("GET "+prefix+c.path+"/{id}", s.reader(c.scope, s.getHandler(c.collection)))
		}
	}

	// Connectivity credentials (people with integration.manage only; API keys hold no scope for it)
	add("GET", "/tenants/{id}/credentials", "", "integration.manage", "API keys, the scope catalog and the audit trail of a tenant", s.listCredentials)
	add("POST", "/tenants/{id}/credentials", "", "integration.manage", "Create an API key; the answer holds the only copy of the secret", s.createCredential)
	add("POST", "/credentials/{id}/rotate", "", "integration.manage", "Replace a key's secret; the old one stops at once", s.rotateCredential)
	add("POST", "/credentials/{id}/revoke", "", "integration.manage", "Stop a key for good", s.revokeCredential)
	add("GET", "/integrations/{id}/credentials", "", "integration.manage", "Which connector values are set, never the values", s.getConnectorCredentials)
	add("PUT", "/integrations/{id}/credentials", "", "integration.manage", "Set or clear connector values; they are stored encrypted", s.saveConnectorCredentials)

	add("POST", "/integrations/{id}/credentials/test", "", "integration.manage", "Call the provider with the stored values and report the outcome", s.testConnector)

	// Outbound webhooks (people with integration.manage only)
	add("GET", "/tenants/{id}/webhooks", "", "integration.manage", "Webhook endpoints, the event catalog and the latest deliveries", s.listWebhooks)
	add("POST", "/tenants/{id}/webhooks", "", "integration.manage", "Add an endpoint; the answer holds the only copy of the signing secret", s.createWebhook)
	add("POST", "/webhooks/{id}/enabled", "", "integration.manage", "Pause or resume an endpoint", s.setWebhookEnabled)
	add("POST", "/webhooks/{id}/rotate", "", "integration.manage", "Replace an endpoint's signing secret", s.rotateWebhook)
	add("POST", "/webhooks/{id}/test", "", "integration.manage", "Queue a webhook.test event for an endpoint", s.pingWebhook)
	add("DELETE", "/webhooks/{id}", "", "integration.manage", "Remove an endpoint and its deliveries", s.deleteWebhook)
	add("POST", "/webhook-deliveries/{id}/retry", "", "integration.manage", "Send a failed delivery again", s.retryDelivery)

	// Storefront (public, one store per subdomain)
	add("GET", "/shop", "", "", "The stores on this platform", s.shops)
	add("GET", "/shop/{store}/state", "", "", "A store's public dataset", s.shopState)
	add("GET", "/shop/{store}/events", "", "", "Server-sent events for a store's public dataset", s.shopEvents)
	add("GET", "/shop/{store}/demo-customers", "", "", "Demo shoppers to sign in as (demo mode only)", s.demoCustomers)
	add("POST", "/shop/{store}/sign-in", "", "", "Sign in as a demo shopper (demo mode only)", s.shopSignIn)
	add("POST", "/shop/{store}/login", "", "", "Email and password → shopper token", s.shopLogin)
	add("POST", "/shop/{store}/register", "", "", "Create a shopper account", s.shopRegister)
	add("POST", "/shop/{store}/password", "", "", "Set or change the signed-in shopper's password", s.shopPassword)
	add("GET", "/shop/{store}/me", "", "", "The signed-in shopper and their orders", s.shopMe)
	add("POST", "/shop/{store}/price", "", "", "Price a cart with the store's promotions", s.shopPrice)
	add("POST", "/shop/{store}/orders", "orders/place", "", "Place an order from the storefront", s.shopPlaceOrder)
	add("POST", "/shop/{store}/leads", "leads/save", "", "Send a Talk to sales lead", s.shopLead)
	add("POST", "/shop/{store}/ai/chat", "", "", "Ask the AI what a shopper's message means", s.shopAIChat)

	s.spec = buildSpec(table, s.Version)
}

// Small wrappers for the recurring request shapes.

func body[T any](s *Server, run func(context.Context, service.Meta, T) (*service.Delta, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var v T
		if err := decode(r, &v); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) { return run(r.Context(), m, v) })
	}
}

func upsert[T any](s *Server, run func(service.Meta, *http.Request, T) (*service.Delta, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var v T
		if err := decode(r, &v); err != nil {
			s.writeError(w, r, err)
			return
		}
		if id := idOf(v); id != "" && id != r.PathValue("id") {
			writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "The id in the body must match the URL.")
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) { return run(m, r, v) })
	}
}

func idOnly(s *Server, run func(context.Context, service.Meta, string) (*service.Delta, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s.act(w, r, func(m service.Meta) (*service.Delta, error) { return run(r.Context(), m, r.PathValue("id")) })
	}
}

func status(s *Server, run func(context.Context, service.Meta, string, string) (*service.Delta, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Status string `json:"status"`
		}
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) { return run(r.Context(), m, r.PathValue("id"), in.Status) })
	}
}

func templateOf(s *Server, run func(context.Context, service.Meta, string, string) (*service.Delta, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			TemplateID string `json:"templateId"`
		}
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return run(r.Context(), m, r.PathValue("id"), in.TemplateID)
		})
	}
}

func note(s *Server, run func(context.Context, service.Meta, string, string) (*service.Delta, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Note string `json:"note"`
		}
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) { return run(r.Context(), m, r.PathValue("id"), in.Note) })
	}
}

func adjust(s *Server, run func(context.Context, service.Meta, string, int, string) (*service.Delta, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Delta int    `json:"delta"`
			Note  string `json:"note"`
		}
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return run(r.Context(), m, r.PathValue("id"), in.Delta, in.Note)
		})
	}
}

func receive(s *Server, run func(context.Context, service.Meta, service.ReceiveInput) (*service.Delta, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in service.ReceiveInput
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) { return run(r.Context(), m, in) })
	}
}

// idOf reads the id of a decoded entity, if it has one.
func idOf(v any) string {
	switch e := v.(type) {
	case domain.Product:
		return e.ID
	case domain.Category:
		return e.ID
	case domain.AttributeDef:
		return e.ID
	case domain.ModifierGroup:
		return e.ID
	case domain.Collection:
		return e.ID
	case domain.PaymentType:
		return e.ID
	case domain.Customer:
		return e.ID
	case domain.Segment:
		return e.ID
	case domain.Lead:
		return e.ID
	case domain.Campaign:
		return e.ID
	case domain.Automation:
		return e.ID
	case domain.Promotion:
		return e.ID
	case domain.Seller:
		return e.ID
	}
	return ""
}
