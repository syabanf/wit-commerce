package httpapi

import (
	"crypto/subtle"
	"net/http"
	"net/url"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/modules/identity"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

const (
	// domainChecksPerTenant caps DNS checks, each of which asks a resolver up to three questions.
	domainChecksPerTenant = 10
	// hostLookupsPerIP covers a storefront asking once per page load on a custom domain.
	hostLookupsPerIP = 120
)

// domainInput is the body of PUT /tenants/{id}/domain. Null disconnects the domain.
type domainInput struct {
	Domain *string `json:"domain"`
}

// domainCheckResponse is the delta of a DNS check plus how each record did.
type domainCheckResponse struct {
	DeltaResponse
	DomainStatus identity.DomainStatus `json:"domainStatus"`
}

type storeByHostResponse struct {
	Store string `json:"store"`
}

// domainConfig is what custom domain checks know about the platform, from the server's options.
func (o Options) domainConfig() identity.DomainConfig {
	c := identity.DomainConfig{
		Resolver: o.DNS, Timeout: o.DNSTimeout, StoreRoot: o.StoreRootDomain, Target: o.DomainTarget, TargetIPs: o.DomainTargetIPs,
	}
	if u, err := url.Parse(o.PublicURL); err == nil && u.Hostname() != "" {
		c.PlatformHosts = []string{u.Hostname()}
	}
	return c
}

func (s *Server) getDomain(w http.ResponseWriter, r *http.Request) {
	status, err := s.svc.DomainStatusOf(r.Context(), s.meta(r), r.PathValue("id"))
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}

// setDomain connects or disconnects a custom domain. The server issues the token; a client never
// chooses the value that proves ownership.
func (s *Server) setDomain(w http.ResponseWriter, r *http.Request) {
	var in domainInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	if in.Domain != nil {
		*in.Domain = strings.TrimSpace(*in.Domain)
	}
	s.act(w, r, func(m service.Meta) (*service.Delta, error) {
		return s.svc.SetDomain(r.Context(), m, r.PathValue("id"), in.Domain, identity.NewDomainToken())
	})
}

func (s *Server) verifyDomain(w http.ResponseWriter, r *http.Request) {
	if !s.domainChecks.allow(r.PathValue("id"), w) {
		writeProblem(w, http.StatusTooManyRequests, "RATE_LIMITED", "Too many checks. Wait a minute and try again.")
		return
	}
	status, d, err := s.svc.VerifyDomain(r.Context(), s.meta(r), r.PathValue("id"))
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	out := s.publish(d)
	out["domainStatus"] = status
	writeJSON(w, http.StatusOK, out)
}

// shopByHost tells a storefront opened on a custom domain which store it is. Only a verified domain
// answers; anything else is a 404, so an unverified claim never serves a store.
func (s *Server) shopByHost(w http.ResponseWriter, r *http.Request) {
	if !s.hostLookups.allow(s.clientIP(r), w) {
		writeProblem(w, http.StatusTooManyRequests, "RATE_LIMITED", "Too many requests. Wait a minute and try again.")
		return
	}
	store, ok, err := s.svc.StoreByDomain(r.Context(), r.URL.Query().Get("host"))
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if !ok {
		writeProblem(w, http.StatusNotFound, "NOT_FOUND", "No store at this address.")
		return
	}
	writeJSON(w, http.StatusOK, storeByHostResponse{Store: store})
}

// domainAllowed answers a TLS proxy that asks before it issues a certificate (Caddy's on-demand
// "ask"): 200 for a verified custom domain, 404 for anything else. With DOMAIN_ASK_SECRET set the
// caller must send it as ?secret=. The web container never forwards /api/v1/internal/.
func (s *Server) domainAllowed(w http.ResponseWriter, r *http.Request) {
	if s.DomainAskSecret != "" && subtle.ConstantTimeCompare([]byte(r.URL.Query().Get("secret")), []byte(s.DomainAskSecret)) != 1 {
		writeProblem(w, http.StatusForbidden, "FORBIDDEN", "This endpoint is for the platform's proxy.")
		return
	}
	_, ok, err := s.svc.StoreByDomain(r.Context(), r.URL.Query().Get("domain"))
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if !ok {
		writeProblem(w, http.StatusNotFound, "NOT_FOUND", "This domain is not verified.")
		return
	}
	writeJSON(w, http.StatusOK, okResponse{Ok: true})
}
