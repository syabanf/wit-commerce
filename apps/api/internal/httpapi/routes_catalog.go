package httpapi

import (
	"net/http"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

// catalogRoutes registers products, categories, attributes, modifiers, collections and payment types.
func (s *Server) catalogRoutes(rt *router) {
	rt.add("PUT", "/products/{id}", "products/save", "product.manage", "Create or replace a product", upsert(s, func(m service.Meta, r *http.Request, p domain.Product) (*service.Delta, error) {
		return s.svc.SaveProduct(r.Context(), m, p)
	}))
	rt.add("PUT", "/products/{id}/attributes", "products/setAttributes", "product.manage", "Replace a product's attribute values", func(w http.ResponseWriter, r *http.Request) {
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
	rt.add("POST", "/products/{id}/status", "products/setStatus", "product.manage", "Draft, schedule, activate or archive a product", status(s, s.svc.SetProductStatus))
	rt.add("PUT", "/categories/{id}", "categories/save", "product.manage", "Create or replace a category", upsert(s, func(m service.Meta, r *http.Request, c domain.Category) (*service.Delta, error) {
		return s.svc.SaveCategory(r.Context(), m, c)
	}))
	rt.add("DELETE", "/categories/{id}", "categories/remove", "product.manage", "Remove an unused category", idOnly(s, s.svc.RemoveCategory))
	rt.add("PUT", "/attributes/{id}", "attributes/save", "product.manage", "Create or replace an attribute definition", upsert(s, func(m service.Meta, r *http.Request, a domain.AttributeDef) (*service.Delta, error) {
		return s.svc.SaveAttribute(r.Context(), m, a)
	}))
	rt.add("DELETE", "/attributes/{id}", "attributes/remove", "product.manage", "Remove an attribute; products drop its value", idOnly(s, s.svc.RemoveAttribute))
	rt.add("PUT", "/modifiers/{id}", "modifiers/save", "product.manage", "Create or replace a modifier group", upsert(s, func(m service.Meta, r *http.Request, g domain.ModifierGroup) (*service.Delta, error) {
		return s.svc.SaveModifierGroup(r.Context(), m, g)
	}))
	rt.add("DELETE", "/modifiers/{id}", "modifiers/remove", "product.manage", "Remove a modifier group without stock", idOnly(s, s.svc.RemoveModifierGroup))
	rt.add("PUT", "/collections/{id}", "collections/save", "product.manage", "Create or replace a collection", upsert(s, func(m service.Meta, r *http.Request, c domain.Collection) (*service.Delta, error) {
		return s.svc.SaveCollection(r.Context(), m, c)
	}))
	rt.add("DELETE", "/collections/{id}", "collections/remove", "product.manage", "Remove a collection", idOnly(s, s.svc.RemoveCollection))
	rt.add("PUT", "/payment-types/{id}", "paymentTypes/save", "integration.manage", "Create or replace a payment type", upsert(s, func(m service.Meta, r *http.Request, p domain.PaymentType) (*service.Delta, error) {
		return s.svc.SavePaymentType(r.Context(), m, p)
	}))
	rt.add("POST", "/payment-types/{id}/toggle", "paymentTypes/toggle", "integration.manage", "Turn a payment type on or off", idOnly(s, s.svc.TogglePaymentType))
}
