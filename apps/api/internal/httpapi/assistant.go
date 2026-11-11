package httpapi

import (
	"errors"
	"net/http"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	aimodule "github.com/syabanf/wit-commerce/apps/api/internal/modules/ai"
)

const (
	assistantRatePerUser    = 20
	assistantDailyPerTenant = 500
)

// The assistant's types, under the names the tests and the OpenAPI document use.
type (
	AssistantInput   = aimodule.AssistantInput
	AssistantMessage = aimodule.AssistantMessage
	AssistantAnswer  = aimodule.AssistantAnswer
)

// adminAssistant answers a staff member's question about one brand. The model reads aggregate facts
// scoped to the person's role and proposes actions; the console runs one only after Confirm, through
// the action's own route, so the API checks the permission again. Nothing here writes.
func (s *Server) adminAssistant(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.From(r.Context())
	tenantID, err := readTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if s.assistant == nil {
		writeProblem(w, http.StatusServiceUnavailable, "AI_OFF", "The assistant model is not configured.")
		return
	}
	var in AssistantInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	if in, err = aimodule.PrepareAssistant(in); err != nil {
		s.writeError(w, r, err)
		return
	}
	// Each call costs money, so both limits sit before the facts and the model.
	if !s.assistantUsers.allow(p.ID, w) || !s.assistantTenants.allow(tenantID, w) {
		writeProblem(w, http.StatusTooManyRequests, "RATE_LIMITED", "Too many questions. Try again in a minute.")
		return
	}
	facts, err := s.assistantFacts(r.Context(), p, tenantID, in.Page)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	answer, err := s.assistant.Assist(r.Context(), facts, in)
	var failed aimodule.ModelError
	if errors.As(err, &failed) {
		s.Log.Warn("admin assistant failed", "err", failed.Err, "requestId", requestIDOf(r.Context()))
		writeProblem(w, http.StatusBadGateway, "AI_FAILED", "The assistant model did not answer.")
		return
	}
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, answer)
}
