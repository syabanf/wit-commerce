package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
)

const assistantLogPage = 50

// AssistantLogAction is one proposal in the log, with what the person did with it.
type AssistantLogAction struct {
	Type    string   `json:"type"`
	Targets []string `json:"targets"`
	Risk    string   `json:"risk,omitempty"`
	// Outcome is confirmed, dismissed or failed; absent while the card was left open.
	Outcome *string `json:"outcome,omitempty"`
}

// AssistantLogEntry is one question in the assistant log.
type AssistantLogEntry struct {
	ID           string               `json:"id"`
	At           time.Time            `json:"at"`
	UserID       string               `json:"userId"`
	UserName     string               `json:"userName"`
	Page         string               `json:"page"`
	Question     string               `json:"question"`
	ModelCalls   int                  `json:"modelCalls"`
	Lookups      []string             `json:"lookups"`
	AnswerLength int                  `json:"answerLength"`
	Actions      []AssistantLogAction `json:"actions"`
	// Feedback is up, down or absent.
	Feedback  string `json:"feedback,omitempty"`
	LatencyMs int    `json:"latencyMs"`
	ErrorCode string `json:"errorCode,omitempty"`
}

// AssistantLogPage is one page of a brand's log, newest first.
type AssistantLogPage struct {
	Entries []AssistantLogEntry `json:"entries"`
	// NextBefore goes in ?before= for the next page; absent on the last one.
	NextBefore string `json:"nextBefore,omitempty"`
}

// assistantLog lists a brand's questions for its tenant admins: ?userId=, ?outcome=
// (confirmed|dismissed|failed|open), ?from= and ?to= (YYYY-MM-DD, WIB) and ?before= (an RFC 3339
// time from nextBefore).
func (s *Server) assistantLog(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.From(r.Context())
	tenantID, err := readTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if !isTenantAdmin(p) {
		writeProblem(w, http.StatusForbidden, "FORBIDDEN", "Only a tenant admin reads the assistant log.")
		return
	}
	where, args := "l.tenant_id = $1", []any{tenantID}
	add := func(cond string, v any) {
		args = append(args, v)
		where += fmt.Sprintf(" and "+cond, len(args))
	}
	if v := trimmed(r, "userId"); v != "" {
		add("l.user_id = $%d", v)
	}
	switch v := trimmed(r, "outcome"); v {
	case "":
	case "confirmed", "dismissed", "failed":
		add("l.actions @> jsonb_build_array(jsonb_build_object('outcome', $%d::text))", v)
	case "open":
		where += " and exists (select 1 from jsonb_array_elements(l.actions) a where a->'outcome' = 'null'::jsonb)"
	default:
		writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "outcome is confirmed, dismissed, failed or open.")
		return
	}
	for key, cond := range map[string]string{"from": "l.at >= $%d", "to": "l.at < $%d"} {
		v := trimmed(r, key)
		if v == "" {
			continue
		}
		day, err := time.ParseInLocation(time.DateOnly, v, clock.WIB)
		if err != nil {
			writeProblem(w, http.StatusUnprocessableEntity, "INVALID", key+" must be a date like 2026-10-05.")
			return
		}
		if key == "to" {
			day = day.AddDate(0, 0, 1)
		}
		add(cond, day)
	}
	if v := trimmed(r, "before"); v != "" {
		at, err := time.Parse(time.RFC3339Nano, v)
		if err != nil {
			writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "before must be a time from nextBefore.")
			return
		}
		add("l.at < $%d", at)
	}
	rows, err := s.DB.Pool.Query(r.Context(), `select l.id, l.at, l.user_id, coalesce(u.data->>'name', l.user_id), l.page, l.question,
		l.model_calls, l.lookups, l.answer_length, l.actions, coalesce(l.feedback, 0), l.latency_ms, coalesce(l.error_code, '')
		from assistant_log l left join users u on u.id = l.user_id where `+where+` order by l.at desc, l.id desc limit `+strconv.Itoa(assistantLogPage+1), args...)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	entries, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (AssistantLogEntry, error) {
		var e AssistantLogEntry
		var actions []byte
		var feedback int
		if err := row.Scan(&e.ID, &e.At, &e.UserID, &e.UserName, &e.Page, &e.Question, &e.ModelCalls, &e.Lookups, &e.AnswerLength,
			&actions, &feedback, &e.LatencyMs, &e.ErrorCode); err != nil {
			return e, err
		}
		e.Feedback = map[int]string{1: "up", -1: "down"}[feedback]
		return e, json.Unmarshal(actions, &e.Actions)
	})
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	out := AssistantLogPage{Entries: entries}
	if len(entries) > assistantLogPage {
		out.Entries = entries[:assistantLogPage]
		out.NextBefore = out.Entries[assistantLogPage-1].At.Format(time.RFC3339Nano)
	}
	if out.Entries == nil {
		out.Entries = []AssistantLogEntry{}
	}
	writeJSON(w, http.StatusOK, out)
}

// AssistantBrandTotals is one brand's use of the assistant over 30 days.
type AssistantBrandTotals struct {
	TenantID   string `json:"tenantId"`
	TenantName string `json:"tenantName"`
	Questions  int    `json:"questions"`
	ModelCalls int    `json:"modelCalls"`
	Proposed   int    `json:"proposed"`
	Confirmed  int    `json:"confirmed"`
	Dismissed  int    `json:"dismissed"`
	Failed     int    `json:"failed"`
	Errors     int    `json:"errors"`
	ThumbsUp   int    `json:"thumbsUp"`
	ThumbsDown int    `json:"thumbsDown"`
}

// AssistantTotals is every brand's use over the last 30 days, for platform admins.
type AssistantTotals struct {
	Since  time.Time              `json:"since"`
	Brands []AssistantBrandTotals `json:"brands"`
}

func (s *Server) assistantTotals(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.From(r.Context())
	if p.Role != "platform_admin" {
		writeProblem(w, http.StatusForbidden, "FORBIDDEN", "Only a platform admin reads the totals of every brand.")
		return
	}
	since := s.Clock.Now().AddDate(0, 0, -30)
	rows, err := s.DB.Pool.Query(r.Context(), `select l.tenant_id, coalesce(t.data->>'name', l.tenant_id), count(*), sum(l.model_calls),
		coalesce(sum(jsonb_array_length(l.actions)), 0),
		coalesce(sum((select count(*) from jsonb_array_elements(l.actions) a where a->>'outcome' = 'confirmed')), 0),
		coalesce(sum((select count(*) from jsonb_array_elements(l.actions) a where a->>'outcome' = 'dismissed')), 0),
		coalesce(sum((select count(*) from jsonb_array_elements(l.actions) a where a->>'outcome' = 'failed')), 0),
		count(*) filter (where l.error_code is not null), count(*) filter (where l.feedback = 1), count(*) filter (where l.feedback = -1)
		from assistant_log l left join tenants t on t.id = l.tenant_id where l.at >= $1 group by 1, 2 order by 3 desc, 1`, since)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	brands, err := pgx.CollectRows(rows, pgx.RowToStructByPos[AssistantBrandTotals])
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if brands == nil {
		brands = []AssistantBrandTotals{}
	}
	writeJSON(w, http.StatusOK, AssistantTotals{Since: since, Brands: brands})
}
