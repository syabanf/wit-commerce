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

// router collects the route table while it registers handlers on the mux.
type router struct {
	s     *Server
	mux   *http.ServeMux
	table []Route
}

func (rt *router) add(method, path, action, permission, summary string, h http.HandlerFunc) {
	rt.table = append(rt.table, Route{
		Method: method, Path: prefix + path, Action: action, Permission: permission,
		Scope: auth.ScopeFor(permission), Summary: summary,
	})
	if permission != "" || action == "system/tick" {
		h = rt.s.user(permission, h)
	}
	rt.mux.HandleFunc(method+" "+prefix+path, h)
}

// routes registers every module's routes. The calls run in table order, so GET /routes and
// openapi.json list the endpoints in the same sequence.
func (s *Server) routes(mux *http.ServeMux) {
	rt := &router{s: s, mux: mux}
	s.platformRoutes(rt)
	s.staffRoutes(rt)
	s.sessionRoutes(rt)
	s.tenantRoutes(rt)
	s.catalogRoutes(rt)
	s.inventoryRoutes(rt)
	s.orderRoutes(rt)
	s.crmRoutes(rt)
	s.marketingRoutes(rt)
	s.storefrontRoutes(rt)
	s.integrationRoutes(rt)
	s.paymentRoutes(rt)
	s.mediaRoutes(rt)

	// Reads for connected systems, paged by id
	for _, c := range readable {
		rt.table = append(rt.table, Route{Method: "GET", Path: prefix + c.path, Scope: c.scope, Summary: "List " + c.label})
		rt.mux.HandleFunc("GET "+prefix+c.path, s.reader(c.scope, s.listHandler(c.collection, c.hasStatus)))
		if c.single {
			rt.table = append(rt.table, Route{Method: "GET", Path: prefix + c.path + "/{id}", Scope: c.scope, Summary: "Read one of " + c.label})
			rt.mux.HandleFunc("GET "+prefix+c.path+"/{id}", s.reader(c.scope, s.getHandler(c.collection)))
		}
	}

	s.connectivityRoutes(rt)
	s.shopRoutes(rt)

	s.spec = buildSpec(rt.table, s.Version)
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
