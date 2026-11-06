package httpapi

import (
	"net/http"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

// storefrontRoutes registers pages and sellers.
func (s *Server) storefrontRoutes(rt *router) {
	rt.add("POST", "/pages", "pages/create", "store.manage", "Create a page", body(s, s.svc.CreatePage))
	rt.add("PUT", "/pages/{id}", "pages/save", "store.manage", "Save page content as a new revision", func(w http.ResponseWriter, r *http.Request) {
		var in service.SavePageInput
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.SavePage(r.Context(), m, r.PathValue("id"), in)
		})
	})
	rt.add("POST", "/pages/{id}/template", "pages/setTemplate", "store.manage", "Lay the page out with another template", templateOf(s, s.svc.SetPageTemplate))
	rt.add("POST", "/pages/{id}/publish", "pages/publish", "store.manage", "Publish a page", idOnly(s, s.svc.PublishPage))
	rt.add("POST", "/pages/{id}/schedule", "pages/schedule", "store.manage", "Schedule a page", func(w http.ResponseWriter, r *http.Request) {
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
	rt.add("POST", "/pages/{id}/unpublish", "pages/unpublish", "store.manage", "Take a page back to draft", idOnly(s, s.svc.UnpublishPage))
	rt.add("POST", "/pages/{id}/rollback", "pages/rollback", "store.manage", "Restore a revision", func(w http.ResponseWriter, r *http.Request) {
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
	rt.add("PUT", "/sellers/{id}", "sellers/save", "seller.manage", "Create or replace a seller; their page follows", upsert(s, func(m service.Meta, r *http.Request, seller domain.Seller) (*service.Delta, error) {
		return s.svc.SaveSeller(r.Context(), m, seller)
	}))
	rt.add("POST", "/sellers/{id}/template", "sellers/setTemplate", "seller.manage", "Give a seller another allowed template", templateOf(s, s.svc.SetSellerTemplate))
	rt.add("POST", "/sellers/{id}/status", "sellers/setStatus", "seller.manage", "Activate, invite or suspend a seller", status(s, s.svc.SetSellerStatus))
}

// shopRoutes registers the public storefront, one store per subdomain.
func (s *Server) shopRoutes(rt *router) {
	rt.add("GET", "/shop", "", "", "The stores on this platform", s.shops)
	rt.add("GET", "/shop/{store}/state", "", "", "A store's public dataset", s.shopState)
	rt.add("GET", "/shop/{store}/events", "", "", "Server-sent events for a store's public dataset", s.shopEvents)
	rt.add("GET", "/shop/{store}/demo-customers", "", "", "Demo shoppers to sign in as (demo mode only)", s.demoCustomers)
	rt.add("POST", "/shop/{store}/sign-in", "", "", "Sign in as a demo shopper (demo mode only)", s.shopSignIn)
	rt.add("POST", "/shop/{store}/login", "", "", "Email and password → shopper token", s.shopLogin)
	rt.add("POST", "/shop/{store}/register", "", "", "Create a shopper account", s.shopRegister)
	rt.add("POST", "/shop/{store}/forgot", "", "", "Email a shopper a link to choose a new password", s.shopForgot)
	rt.add("POST", "/shop/{store}/reset", "", "", "Choose a shopper password with a link from email", s.shopReset)
	rt.add("POST", "/shop/{store}/verify-email", "", "", "Email the signed-in shopper a link that proves their inbox", s.shopSendVerify)
	rt.add("POST", "/shop/{store}/verify", "", "", "Confirm an email and bring guest orders into the account", s.shopVerify)
	rt.add("POST", "/shop/{store}/password", "", "", "Set or change the signed-in shopper's password", s.shopPassword)
	rt.add("GET", "/shop/{store}/me", "", "", "The signed-in shopper and their orders", s.shopMe)
	rt.add("POST", "/shop/{store}/price", "", "", "Price a cart with the store's promotions", s.shopPrice)
	rt.add("POST", "/shop/{store}/orders", "orders/place", "", "Place an order from the storefront", s.shopPlaceOrder)
	rt.add("POST", "/shop/{store}/leads", "leads/save", "", "Send a Talk to sales lead", s.shopLead)
	rt.add("POST", "/shop/{store}/ai/chat", "", "", "Ask the AI what a shopper's message means", s.shopAIChat)
}
