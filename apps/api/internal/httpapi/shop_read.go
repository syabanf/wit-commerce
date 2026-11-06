package httpapi

import (
	"net/http"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

// ShopReadRoutes are the public, unauthenticated reads cmd/shop serves. Every shopper write, sign-in
// and AI route stays on the API.
var ShopReadRoutes = []string{
	"GET " + prefix + "/health",
	"GET " + prefix + "/shop",
	"GET " + prefix + "/shop/{store}/state",
	"GET " + prefix + "/shop/{store}/events",
}

// NewShopReadHandler serves ShopReadRoutes with the API's own handlers and middleware. It registers
// the platform and shop routes on a private mux, as New does, and exposes only those patterns, so
// paths, bodies and headers match cmd/api.
func NewShopReadHandler(o Options) http.Handler {
	s := &Server{Options: o, svc: service.New(kernel.Runtime{DB: o.DB, Clock: o.Clock})}
	all := http.NewServeMux()
	rt := &router{s: s, mux: all}
	s.platformRoutes(rt)
	s.shopRoutes(rt)
	registered := map[string]bool{}
	for _, r := range rt.table {
		registered[r.Method+" "+r.Path] = true
	}
	mux := http.NewServeMux()
	for _, pattern := range ShopReadRoutes {
		if !registered[pattern] {
			panic("httpapi: shop read route " + pattern + " is not registered")
		}
		mux.Handle(pattern, all)
	}
	return s.requestID(s.cors(s.recover(s.logRequests(mux))))
}
