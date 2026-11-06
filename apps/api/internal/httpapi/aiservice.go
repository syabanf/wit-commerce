package httpapi

import (
	"context"
	"net/http"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	aimodule "github.com/syabanf/wit-commerce/apps/api/internal/modules/ai"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

// aiChatPath is the route in routes_storefront.go; a test in cmd/ai checks the two still match.
const aiChatPath = prefix + "/shop/{store}/ai/chat"

// NewAIHandler serves the shopper AI chat on its own: the monolith's handler and middleware, with
// rate limits of its own, plus GET /health. It reads DB, Clock, AI, Log, TrustProxy, AllowedOrigins
// and Version from o.
func NewAIHandler(o Options) http.Handler {
	s := &Server{Options: o, aiClients: newKeyLimiter(aiRatePerClient), aiTotal: newKeyLimiter(aiRateTotal)}
	s.svc = service.New(kernel.Runtime{DB: o.DB, Clock: o.Clock})
	s.assistant = aimodule.New(o.AI, s.svc.Catalog)
	mux := http.NewServeMux()
	mux.HandleFunc("POST "+aiChatPath, s.shopAIChat)
	mux.HandleFunc("GET /health", s.aiHealth)
	return s.requestID(s.cors(s.recover(s.logRequests(mux))))
}

func (s *Server) aiHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	dbOK := s.DB.Pool.Ping(ctx) == nil
	status := http.StatusOK
	if !dbOK {
		status = http.StatusServiceUnavailable
	}
	writeJSON(w, status, map[string]any{"ok": dbOK, "version": s.Version, "db": dbOK, "model": s.assistant != nil})
}
