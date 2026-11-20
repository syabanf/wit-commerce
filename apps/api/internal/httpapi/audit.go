package httpapi

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

// audited marks a staff or API key write so the action it runs records an audit_log row in its own
// transaction (see kernel.WithAudit).
func (s *Server) audited(action string, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := kernel.WithAudit(r.Context(), kernel.AuditInfo{Action: action, RequestID: requestIDOf(r.Context()), IP: s.clientIP(r)})
		h(w, r.WithContext(ctx))
	}
}

const (
	auditPage      = 50
	auditMaxPage   = 200
	auditExportMax = 50000
)

// AuditEntry is one row of the audit log. Changes lists each row the action touched with its
// changed fields; personal and secret values read "changed".
type AuditEntry struct {
	ID               string               `json:"id"`
	At               time.Time            `json:"at"`
	TenantID         string               `json:"tenantId,omitempty"`
	ActorKind        string               `json:"actorKind"`
	ActorID          string               `json:"actorId"`
	ActorName        string               `json:"actorName"`
	ActorRole        string               `json:"actorRole,omitempty"`
	APIKeyID         string               `json:"apiKeyId,omitempty"`
	Action           string               `json:"action"`
	EntityCollection string               `json:"entityCollection"`
	EntityIDs        []string             `json:"entityIds"`
	Changes          []kernel.AuditChange `json:"changes"`
	RequestID        string               `json:"requestId,omitempty"`
	IP               string               `json:"ip,omitempty"`
}

// AuditPage is one page of the log, newest first.
type AuditPage struct {
	Entries []AuditEntry `json:"entries"`
	// NextBefore goes in ?before= for the next page; absent on the last one.
	NextBefore string `json:"nextBefore,omitempty"`
}

// auditQuery builds the where clause from ?actorId=, ?action= (exact, or a prefix ending in /),
// ?collection=, ?entityId= (with collection: any row the action touched; without: the action's own
// entity), ?from= and ?to= (YYYY-MM-DD, WIB) and ?before= (an id from nextBefore).
func auditQuery(r *http.Request, tenantID string) (string, []any, error) {
	where, args := "tenant_id = $1", []any{tenantID}
	add := func(cond string, v any) {
		args = append(args, v)
		where += fmt.Sprintf(" and "+cond, len(args))
	}
	if v := trimmed(r, "actorId"); v != "" {
		add("actor_id = $%d", v)
	}
	if v := trimmed(r, "action"); strings.HasSuffix(v, "/") {
		add("starts_with(action, $%d)", v)
	} else if v != "" {
		add("action = $%d", v)
	}
	collection, entity := trimmed(r, "collection"), trimmed(r, "entityId")
	switch {
	case collection != "" && entity != "":
		add("refs @> array[$%d::text]", collection+":"+entity)
	case collection != "":
		add("entity_collection = $%d", collection)
	case entity != "":
		add("entity_ids @> array[$%d::text]", entity)
	}
	for key, cond := range map[string]string{"from": "at >= $%d", "to": "at < $%d"} {
		v := trimmed(r, key)
		if v == "" {
			continue
		}
		day, err := time.ParseInLocation(time.DateOnly, v, clock.WIB)
		if err != nil {
			return "", nil, service.Invalid{Reason: key + " must be a date like 2026-10-05."}
		}
		if key == "to" {
			day = day.AddDate(0, 0, 1)
		}
		add(cond, day)
	}
	if v := trimmed(r, "before"); v != "" {
		id, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			return "", nil, service.Invalid{Reason: "before must be an id from nextBefore."}
		}
		add("id < $%d", id)
	}
	return where, args, nil
}

func (s *Server) auditRows(ctx context.Context, where string, args []any, limit int) ([]AuditEntry, error) {
	rows, err := s.DB.Pool.Query(ctx, `select id, at, coalesce(tenant_id, ''), actor_kind, actor_id, actor_name, actor_role,
		coalesce(api_key_id, ''), action, entity_collection, entity_ids, changes, request_id, ip
		from audit_log where `+where+` order by id desc limit `+strconv.Itoa(limit), args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (AuditEntry, error) {
		var e AuditEntry
		var id int64
		err := row.Scan(&id, &e.At, &e.TenantID, &e.ActorKind, &e.ActorID, &e.ActorName, &e.ActorRole, &e.APIKeyID,
			&e.Action, &e.EntityCollection, &e.EntityIDs, &e.Changes, &e.RequestID, &e.IP)
		e.ID = strconv.FormatInt(id, 10)
		return e, err
	})
}

// auditLog pages through a brand's audit log, newest first, by id (keyset).
func (s *Server) auditLog(w http.ResponseWriter, r *http.Request) {
	tenantID, err := readTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	where, args, err := auditQuery(r, tenantID)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	limit := auditPage
	if v, err := strconv.Atoi(trimmed(r, "limit")); err == nil && v > 0 {
		limit = min(v, auditMaxPage)
	}
	entries, err := s.auditRows(r.Context(), where, args, limit+1)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	out := AuditPage{Entries: entries}
	if len(entries) > limit {
		out.Entries = entries[:limit]
		out.NextBefore = out.Entries[limit-1].ID
	}
	if out.Entries == nil {
		out.Entries = []AuditEntry{}
	}
	writeJSON(w, http.StatusOK, out)
}

// auditExport writes the filtered log as CSV, newest first, up to auditExportMax rows. UTF-8 with
// a byte order mark so Excel reads it; ?delimiter=; for spreadsheets set to Indonesian locale.
func (s *Server) auditExport(w http.ResponseWriter, r *http.Request) {
	tenantID, err := readTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	where, args, err := auditQuery(r, tenantID)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	entries, err := s.auditRows(r.Context(), where, args, auditExportMax)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="audit-log-`+tenantID+`.csv"`)
	_, _ = w.Write([]byte(service.CSVBOM))
	cw := csv.NewWriter(w)
	cw.Comma = service.CSVDelimiter(trimmed(r, "delimiter"))
	_ = cw.Write([]string{"id", "at", "actor_kind", "actor_id", "actor_name", "actor_role", "api_key_id", "action",
		"entity_collection", "entity_ids", "changes", "request_id", "ip"})
	for _, e := range entries {
		_ = cw.Write(service.CSVSafe([]string{e.ID, clock.Iso(e.At), e.ActorKind, e.ActorID, e.ActorName, e.ActorRole, e.APIKeyID,
			e.Action, e.EntityCollection, strings.Join(e.EntityIDs, " "), changesText(e.Changes), e.RequestID, e.IP}))
	}
	cw.Flush()
}

func changesText(changes []kernel.AuditChange) string {
	raw, _ := json.Marshal(changes)
	return string(raw)
}
