// Package httpapi is the HTTP face of the service: routes, auth, the state endpoints and the
// server-sent events stream. Handlers parse, call one service method and write the answer.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/ai"
	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Options configures the server.
type Options struct {
	DB     *store.DB
	Clock  clock.Clock
	Signer *auth.Signer
	Vault  *auth.Vault
	// Outbound makes webhook and provider calls; AllowInternalWebhooks permits http:// endpoints.
	Outbound              *http.Client
	AllowInternalWebhooks bool
	// AI understands shoppers' messages; nil turns it off and the storefront uses its own parser.
	AI *ai.Client
	// TrustProxy reads the client address from X-Forwarded-For; set it only behind a proxy.
	TrustProxy bool
	Hub        *events.Hub
	Log        *slog.Logger
	Version    string
	// DemoLogin turns on the demo account lists and the password-less storefront sign-in.
	DemoLogin bool
	// AllowedOrigins get CORS headers; empty means same-origin only.
	AllowedOrigins []string
}

// Server holds the dependencies handlers read.
type Server struct {
	Options
	svc                         *service.Service
	handler                     http.Handler
	limiter                     *keyLimiter
	aiClients, aiTotal          *keyLimiter
	signInClients, signInEmails *keyLimiter
	spec                        []byte
}

// New builds the server and its handler chain.
func New(o Options) *Server {
	s := &Server{Options: o, svc: &service.Service{DB: o.DB, Clock: o.Clock, Vault: o.Vault, HTTP: o.Outbound, AllowInternalWebhooks: o.AllowInternalWebhooks}, limiter: newKeyLimiter(apiKeyRatePerMinute), aiClients: newKeyLimiter(aiRatePerClient), aiTotal: newKeyLimiter(aiRateTotal), signInClients: newKeyLimiter(signInRatePerIP), signInEmails: newKeyLimiter(signInRatePerEmail)}
	mux := http.NewServeMux()
	s.routes(mux)
	s.handler = s.requestID(s.cors(s.recover(s.logRequests(mux))))
	return s
}

// ServeHTTP runs the middleware chain and the routes.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.handler.ServeHTTP(w, r) }

// --- responses ---

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// Problem is application/problem+json.
type Problem struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Status int    `json:"status"`
	Detail string `json:"detail,omitempty"`
	Code   string `json:"code,omitempty"`
}

func writeProblem(w http.ResponseWriter, status int, code, detail string) {
	w.Header().Set("Content-Type", "application/problem+json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Problem{
		Type: "about:blank", Title: http.StatusText(status), Status: status, Detail: detail, Code: code,
	})
}

// writeError maps service errors to statuses.
func (s *Server) writeError(w http.ResponseWriter, r *http.Request, err error) {
	var refusal service.Refusal
	var notFound service.NotFound
	var invalid service.Invalid
	var forbidden service.Forbidden
	switch {
	case errors.As(err, &refusal):
		writeProblem(w, http.StatusConflict, "REFUSED", refusal.Reason)
	case errors.As(err, &notFound):
		writeProblem(w, http.StatusNotFound, "NOT_FOUND", notFound.Error())
	case errors.As(err, &invalid):
		writeProblem(w, http.StatusUnprocessableEntity, "INVALID", invalid.Reason)
	case errors.As(err, &forbidden):
		writeProblem(w, http.StatusForbidden, "FORBIDDEN", forbidden.Error())
	case errors.Is(err, store.ErrNotFound):
		writeProblem(w, http.StatusNotFound, "NOT_FOUND", "not found")
	default:
		s.Log.Error("request failed", "path", r.URL.Path, "err", err, "requestId", requestIDOf(r.Context()))
		writeProblem(w, http.StatusInternalServerError, "INTERNAL", "Something went wrong on our side.")
	}
}

// decode reads a JSON body into v.
func decode(r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, 4<<20)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		return service.Invalid{Reason: "The request body is not valid JSON: " + err.Error()}
	}
	return nil
}

// --- middleware ---

type ctxKey int

const (
	requestIDKey ctxKey = 1
	logSlotKey   ctxKey = 2
)

func requestIDOf(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey).(string)
	return id
}

func (s *Server) requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-Id")
		if id == "" {
			id = fmt.Sprintf("%x", time.Now().UnixNano())
		}
		w.Header().Set("X-Request-Id", id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestIDKey, id)))
	})
}

func (s *Server) cors(next http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, o := range s.AllowedOrigins {
		allowed[strings.TrimRight(o, "/")] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && allowed[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-Id")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if p := recover(); p != nil {
				s.Log.Error("panic", "path", r.URL.Path, "panic", p)
				writeProblem(w, http.StatusInternalServerError, "INTERNAL", "Something went wrong on our side.")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// logRequests writes one slog line and one request_log row per request; the event stream is skipped.
func (s *Server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/events") {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		// The auth wrapper runs deeper in the chain, so it writes who called into this slot.
		var principal string
		r = r.WithContext(context.WithValue(r.Context(), logSlotKey, &principal))
		next.ServeHTTP(sw, r)
		ms := int(time.Since(start).Milliseconds())
		s.Log.Info("request", "method", r.Method, "path", r.URL.Path, "status", sw.status, "ms", ms,
			"principal", principal, "requestId", requestIDOf(r.Context()))
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			_, _ = s.DB.Pool.Exec(ctx, `insert into request_log (request_id, method, path, status, ms, principal)
				values ($1, $2, $3, $4, $5, nullif($6, ''))`, requestIDOf(r.Context()), r.Method, r.URL.Path, sw.status, ms, principal)
		}()
	})
}

// bearer reads the token from the headers or, for EventSource, from ?token=. API keys are refused in
// the query string, where proxies and browser history would keep them.
func bearer(r *http.Request) string {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	if key := r.Header.Get("X-Api-Key"); key != "" {
		return key
	}
	if token := r.URL.Query().Get("token"); !strings.HasPrefix(token, service.APIKeyPrefix) {
		return token
	}
	return ""
}

// principal resolves the token on the request, if any.
func (s *Server) principal(r *http.Request) (auth.Principal, bool) {
	token := bearer(r)
	if token == "" {
		return auth.Principal{}, false
	}
	if strings.HasPrefix(token, service.APIKeyPrefix) {
		return s.svc.Authenticate(r.Context(), token)
	}
	p, err := s.Signer.Verify(token, time.Now())
	if err != nil {
		return auth.Principal{}, false
	}
	return p, true
}

// user wraps a handler that a signed-in user with the permission may call. An API key may call it
// too when the permission maps to a scope the key holds; "" keeps the route for people.
func (s *Server) user(permission string, h http.HandlerFunc) http.HandlerFunc {
	return s.guarded(func(p auth.Principal) (bool, string) {
		if p.Kind == auth.KindAPIKey {
			scope := auth.ScopeFor(permission)
			return scope != "" && p.HasScope(scope), "This API key lacks the scope " + scope + "."
		}
		return permission == "" || auth.Can(p.Role, permission), "Your role cannot do this."
	}, h)
}

// reader wraps a read: any signed-in user of the tenant, or an API key with the scope.
func (s *Server) reader(scope string, h http.HandlerFunc) http.HandlerFunc {
	return s.guarded(func(p auth.Principal) (bool, string) {
		if p.Kind == auth.KindAPIKey {
			return p.HasScope(scope), "This API key lacks the scope " + scope + "."
		}
		return true, ""
	}, h)
}

func (s *Server) guarded(allow func(auth.Principal) (bool, string), h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p, ok := s.principal(r)
		if !ok || (p.Kind != auth.KindUser && p.Kind != auth.KindAPIKey) {
			writeProblem(w, http.StatusUnauthorized, "UNAUTHENTICATED", "Sign in, or send a valid API key.")
			return
		}
		if slot, ok := r.Context().Value(logSlotKey).(*string); ok {
			*slot = string(p.Kind) + ":" + p.ID
		}
		if p.Kind == auth.KindAPIKey && !s.limiter.allow(p.ID, w) {
			writeProblem(w, http.StatusTooManyRequests, "RATE_LIMITED", "Too many requests for this API key. Retry after a minute.")
			return
		}
		if allowed, why := allow(p); !allowed {
			writeProblem(w, http.StatusForbidden, "FORBIDDEN", why)
			return
		}
		h(w, r.WithContext(auth.WithPrincipal(r.Context(), p)))
	}
}

// meta is who acts and when, for a request.
func (s *Server) meta(r *http.Request) service.Meta {
	p, _ := auth.From(r.Context())
	return service.Meta{P: p, At: s.Clock.NowIso()}
}

// publish converts a delta to the wire shape, broadcasts it and returns it.
func (s *Server) publish(d *service.Delta) map[string]any {
	change := events.Change{Upserts: map[string][]events.Row{}, Removes: map[string][]events.Removed{}}
	upserts := map[string][]json.RawMessage{}
	for collection, rows := range d.Upserts {
		for _, row := range rows {
			raw, err := json.Marshal(row)
			if err != nil {
				continue
			}
			var keys struct {
				ID       string `json:"id"`
				TenantID string `json:"tenantId"`
			}
			_ = json.Unmarshal(raw, &keys)
			tenantID := keys.TenantID
			if collection == "tenants" {
				tenantID = keys.ID
			}
			change.Upserts[collection] = append(change.Upserts[collection], events.Row{TenantID: tenantID, Data: raw})
			upserts[collection] = append(upserts[collection], raw)
		}
	}
	for collection, ids := range d.Removes {
		for _, id := range ids {
			change.Removes[collection] = append(change.Removes[collection], events.Removed{ID: id})
		}
	}
	s.Hub.Publish(change)
	removes := d.Removes
	if removes == nil {
		removes = map[string][]string{}
	}
	return map[string]any{"upserts": upserts, "removes": removes, "now": s.Clock.NowIso()}
}

// act runs a service call and writes its delta or error.
func (s *Server) act(w http.ResponseWriter, r *http.Request, run func(m service.Meta) (*service.Delta, error)) {
	d, err := run(s.meta(r))
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, s.publish(d))
}
