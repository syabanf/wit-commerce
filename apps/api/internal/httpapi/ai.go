package httpapi

import (
	"errors"
	"net"
	"net/http"
	"strings"

	aimodule "github.com/syabanf/wit-commerce/apps/api/internal/modules/ai"
)

const (
	aiRatePerClient = 30
	aiRateTotal     = 300
)

// The AI module's types, under the names the tests use.
type (
	AITurn       = aimodule.AITurn
	AIOption     = aimodule.AIOption
	AIChatInput  = aimodule.AIChatInput
	AIChatAnswer = aimodule.AIChatAnswer
)

func (s *Server) shopAIChat(w http.ResponseWriter, r *http.Request) {
	if s.assistant == nil {
		writeProblem(w, http.StatusServiceUnavailable, "AI_OFF", "The assistant model is not configured.")
		return
	}
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	var in AIChatInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	if in, err = aimodule.Prepare(in); err != nil {
		s.writeError(w, r, err)
		return
	}
	// The endpoint is public and each call costs money, so both limits sit before the model.
	if !s.aiClients.allow(s.clientIP(r), w) || !s.aiTotal.allow("all", w) {
		writeProblem(w, http.StatusTooManyRequests, "RATE_LIMITED", "Too many messages. Try again in a minute.")
		return
	}
	answer, err := s.assistant.Chat(r.Context(), tenant, in)
	var failed aimodule.ModelError
	if errors.As(err, &failed) {
		s.Log.Warn("ai chat failed", "err", failed.Err, "requestId", requestIDOf(r.Context()))
		writeProblem(w, http.StatusBadGateway, "AI_FAILED", "The assistant model did not answer.")
		return
	}
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, answer)
}

// clientIP is the caller's address; behind the proxy, the hop the proxy itself appended.
func (s *Server) clientIP(r *http.Request) string {
	if s.TrustProxy {
		if hops := strings.Split(r.Header.Get("X-Forwarded-For"), ","); hops[len(hops)-1] != "" {
			return strings.TrimSpace(hops[len(hops)-1])
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
