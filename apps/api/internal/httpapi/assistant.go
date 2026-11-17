package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	aimodule "github.com/syabanf/wit-commerce/apps/api/internal/modules/ai"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/billing"
)

const (
	assistantRatePerUser = 20
	// assistantDailyPerTenant is the daily cap when the brand's plan cannot be read.
	assistantDailyPerTenant = 500
	// assistantQuestionLimit caps one question: the facts, every lookup and every model call.
	assistantQuestionLimit = 45 * time.Second
)

// The assistant's types, under the names the tests and the OpenAPI document use.
type (
	AssistantInput   = aimodule.AssistantInput
	AssistantMessage = aimodule.AssistantMessage
	AssistantAnswer  = aimodule.AssistantAnswer
)

// adminAssistant answers a staff member's question about one brand. The model reads aggregate facts
// scoped to the person's role, may look up records, and proposes actions; the console runs one only
// after Confirm, through the action's own route, so the API checks the permission again. The only
// write is the question's line in assistant_log.
func (s *Server) adminAssistant(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	p, _ := auth.From(r.Context())
	if employeeOnly(p) {
		writeProblem(w, http.StatusForbidden, "FORBIDDEN", noBrandData)
		return
	}
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
	// Each model call costs money, so both limits sit before the facts and the model, and every
	// call after the first counts again. The daily cap is the brand's plan limit.
	daily, err := s.svc.AssistantDailyLimit(r.Context(), tenantID)
	if err != nil {
		s.Log.Warn("assistant plan limit not read", "err", err, "requestId", requestIDOf(r.Context()))
		daily = assistantDailyPerTenant
	}
	allow := func() bool {
		return s.assistantUsers.allow(p.ID, w) && s.assistantTenants.allowUpTo(tenantID, daily, w)
	}
	if !s.assistantUsers.allow(p.ID, w) {
		writeProblem(w, http.StatusTooManyRequests, "RATE_LIMITED", "Too many questions. Try again in a minute.")
		return
	}
	if !s.assistantTenants.allowUpTo(tenantID, daily, w) {
		writeProblem(w, http.StatusConflict, billing.LimitCode, fmt.Sprintf("Your plan allows %d assistant questions a day, and today's are used. Ask for a larger plan in Settings, Plan & usage.", daily))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), assistantQuestionLimit)
	defer cancel()
	question := in.Messages[len(in.Messages)-1].Text
	facts, sellers, err := s.assistantFacts(ctx, p, tenantID, in.Page, question)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	answer, trace, err := s.assistant.Assist(ctx, facts, in, aimodule.AssistOptions{
		Lookup: s.assistantLookup(tenantID, p.ID, sellers), More: allow,
	})
	entry := assistantEntry{id: ids.New("ans"), tenantID: tenantID, userID: p.ID, page: in.Page, question: question,
		trace: trace, answer: answer, latency: time.Since(start)}
	var failed aimodule.ModelError
	switch {
	case errors.Is(err, aimodule.ErrAssistantLimit):
		entry.errorCode = "RATE_LIMITED"
		s.logAssistant(r, entry)
		writeProblem(w, http.StatusTooManyRequests, "RATE_LIMITED", "Too many questions. Try again in a minute.")
		return
	case errors.As(err, &failed):
		s.Log.Warn("admin assistant failed", "err", failed.Err, "requestId", requestIDOf(r.Context()))
		entry.errorCode = "AI_FAILED"
		s.logAssistant(r, entry)
		writeProblem(w, http.StatusBadGateway, "AI_FAILED", "The assistant model did not answer.")
		return
	case err != nil:
		s.writeError(w, r, err)
		return
	}
	if s.logAssistant(r, entry) {
		answer.ID = entry.id
	}
	writeJSON(w, http.StatusOK, answer)
}

// assistantEntry is one question's line in assistant_log.
type assistantEntry struct {
	id, tenantID, userID, page, question string
	trace                                aimodule.AssistTrace
	answer                               AssistantAnswer
	latency                              time.Duration
	errorCode                            string
}

// loggedAction is what the log keeps of a proposal: no params, so no note or name text.
type loggedAction struct {
	Type    string   `json:"type"`
	Targets []string `json:"targets"`
	Risk    string   `json:"risk,omitempty"`
	Outcome *string  `json:"outcome"`
}

// targetKeys are the params that name a record.
var targetKeys = []string{"id", "levelId", "productId"}

// logAssistant writes the line and reports whether it did. A failure goes to the server log and
// leaves the answer standing; the console then shows it without outcome reporting.
func (s *Server) logAssistant(r *http.Request, e assistantEntry) bool {
	actions := make([]loggedAction, 0, len(e.answer.Actions))
	for _, a := range e.answer.Actions {
		la := loggedAction{Type: a.Type, Targets: []string{}, Risk: a.Risk}
		for _, key := range targetKeys {
			if id, ok := a.Params[key].(string); ok && id != "" {
				la.Targets = append(la.Targets, id)
			}
		}
		actions = append(actions, la)
	}
	raw, _ := json.Marshal(actions)
	lookups := e.trace.Lookups
	if lookups == nil {
		lookups = []string{}
	}
	_, err := s.DB.Pool.Exec(r.Context(), `insert into assistant_log (id, tenant_id, user_id, at, page, question, model_calls, lookups,
		answer_length, actions, latency_ms, error_code) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, nullif($12, ''))`,
		e.id, e.tenantID, e.userID, s.Clock.Now(), e.page, aimodule.Redact(e.question), e.trace.ModelCalls, lookups,
		len([]rune(e.answer.Answer)), raw, e.latency.Milliseconds(), e.errorCode)
	if err != nil {
		s.Log.Error("assistant log not written", "err", err, "requestId", requestIDOf(r.Context()))
		return false
	}
	return true
}

// assistantOutcomeInput reports what the person did with one card, or how they rated the answer.
type assistantOutcomeInput struct {
	AnswerID string `json:"answerId"`
	// Action is the card's index; with Outcome: confirmed, dismissed or failed.
	Action  *int   `json:"action,omitempty"`
	Outcome string `json:"outcome,omitempty"`
	// Feedback is up or down.
	Feedback string `json:"feedback,omitempty"`
}

var outcomes = map[string]bool{"confirmed": true, "dismissed": true, "failed": true}

// assistantOutcome stores a card's outcome or the answer's rating. Only the person who asked may
// report on an answer; any other answer id is not found.
func (s *Server) assistantOutcome(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.From(r.Context())
	var in assistantOutcomeInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	var sql string
	var args []any
	switch {
	case in.Action != nil && outcomes[in.Outcome] && in.Feedback == "":
		sql = `update assistant_log set actions = jsonb_set(actions, array[$3::text, 'outcome'], to_jsonb($4::text))
			where id = $1 and user_id = $2 and $3 >= 0 and $3 < jsonb_array_length(actions)`
		args = []any{in.AnswerID, p.ID, *in.Action, in.Outcome}
	case in.Action == nil && in.Outcome == "" && (in.Feedback == "up" || in.Feedback == "down"):
		rating := 1
		if in.Feedback == "down" {
			rating = -1
		}
		sql = `update assistant_log set feedback = $3 where id = $1 and user_id = $2`
		args = []any{in.AnswerID, p.ID, rating}
	default:
		writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "Send an action index with confirmed, dismissed or failed, or feedback up or down.")
		return
	}
	tag, err := s.DB.Pool.Exec(r.Context(), sql, args...)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeProblem(w, http.StatusNotFound, "NOT_FOUND", "No answer of yours has that id and card.")
		return
	}
	writeJSON(w, http.StatusOK, okResponse{Ok: true})
}

// pruneAssistantLog deletes lines older than 90 days; the tick calls it.
func (s *Server) pruneAssistantLog(ctx context.Context) error {
	_, err := s.DB.Pool.Exec(ctx, `delete from assistant_log where at < $1`, s.Clock.Now().AddDate(0, 0, -90))
	return err
}

// isTenantAdmin is who reads a brand's assistant log.
func isTenantAdmin(p auth.Principal) bool {
	return p.Kind == auth.KindUser && (p.Role == "tenant_admin" || p.Role == "platform_admin")
}

func trimmed(r *http.Request, key string) string { return strings.TrimSpace(r.URL.Query().Get(key)) }
