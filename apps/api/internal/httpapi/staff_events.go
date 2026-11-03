package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

const staffEventsPage = 30

// staffEvent is one line of the staff history. Detail never holds a password or a link.
type staffEvent struct {
	action    string
	detail    string
	target    domain.User
	tenantIDs []string
}

// record adds the line in the caller's transaction. The name is read here, so the line keeps the
// actor's name as it was today.
func (e staffEvent) record(ctx context.Context, q store.Querier, actorID string) error {
	_, err := q.Exec(ctx, `insert into staff_events (actor_id, actor_name, target_id, target_name, action, detail, tenant_ids)
		values ($1, coalesce((select data->>'name' from users where id = $1), 'System'), $2, $3, $4, $5, $6)`,
		actorID, e.target.ID, e.target.Name, e.action, e.detail, e.tenantIDs)
	return err
}

// recordStaff adds a line outside a change, such as the outcome of an email. A failure here must
// not undo what already happened, so it goes to the log.
func (s *Server) recordStaff(ctx context.Context, actorID string, e staffEvent) {
	if err := e.record(ctx, s.DB.Pool, actorID); err != nil {
		s.Log.Error("staff event not recorded", "err", err, "action", e.action, "target", e.target.ID)
	}
}

func orNone(text string) string {
	if text == "" {
		return "none"
	}
	return text
}

func roleLabel(role string) string {
	return strings.ReplaceAll(role, "_", " ")
}

// changesBetween says in words what an edit changes, with brand names as they stand now.
func changesBetween(ctx context.Context, q store.Querier, u domain.User, in staffInput) (string, error) {
	var parts []string
	if u.Name != in.Name {
		parts = append(parts, fmt.Sprintf("name: %s → %s", u.Name, in.Name))
	}
	if u.Title != in.Title {
		parts = append(parts, fmt.Sprintf("title: %s → %s", orNone(u.Title), orNone(in.Title)))
	}
	if u.Role != in.Role {
		parts = append(parts, fmt.Sprintf("role: %s → %s", roleLabel(u.Role), roleLabel(in.Role)))
	}
	if !slices.Equal(u.TenantIDs, in.TenantIDs) {
		before, err := brandNames(ctx, q, u.TenantIDs)
		if err != nil {
			return "", err
		}
		after, err := brandNames(ctx, q, in.TenantIDs)
		if err != nil {
			return "", err
		}
		parts = append(parts, fmt.Sprintf("brands: %s → %s", before, after))
	}
	return strings.Join(parts, "; "), nil
}

func brandNames(ctx context.Context, q store.Querier, ids []string) (string, error) {
	if len(ids) == 0 {
		return "none", nil
	}
	names := make([]string, 0, len(ids))
	for _, id := range ids {
		tenant, err := store.Get[domain.Tenant](ctx, q, "tenants", id)
		if err != nil {
			return "", err
		}
		names = append(names, tenant.Name)
	}
	return strings.Join(names, ", "), nil
}

// staffEventRow is what the history screen reads.
type staffEventRow struct {
	ID         int64     `json:"id"`
	At         time.Time `json:"at"`
	ActorID    string    `json:"actorId"`
	ActorName  string    `json:"actorName"`
	TargetID   string    `json:"targetId"`
	TargetName string    `json:"targetName"`
	Action     string    `json:"action"`
	Detail     string    `json:"detail"`
}

type staffEventsResponse struct {
	Events []staffEventRow `json:"events"`
	// NextBefore goes in ?before= for the next page; absent on the last one.
	NextBefore *int64 `json:"nextBefore,omitempty"`
}

// staffEvents reads one brand's history, newest first. Lines about platform admins carry no brand,
// so only a platform admin reads those.
func (s *Server) staffEvents(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.From(r.Context())
	tenantID := r.URL.Query().Get("tenantId")
	if tenantID == "" || !p.CanAccess(tenantID) {
		writeProblem(w, http.StatusForbidden, "FORBIDDEN", "You cannot read the history of this brand.")
		return
	}
	before := int64(1<<63 - 1)
	if v := r.URL.Query().Get("before"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "before must be a number.")
			return
		}
		before = n
	}
	rows, err := s.DB.Pool.Query(r.Context(), `select id, at, actor_id, actor_name, target_id, target_name, action, detail from staff_events
		where id < $1 and ($2 = any(tenant_ids) or ($3 and cardinality(tenant_ids) = 0)) order by id desc limit $4`,
		before, tenantID, p.Role == "platform_admin", staffEventsPage+1)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	events, err := pgx.CollectRows(rows, pgx.RowToStructByPos[staffEventRow])
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	out := staffEventsResponse{Events: events}
	if len(events) > staffEventsPage {
		out.Events = events[:staffEventsPage]
		next := out.Events[staffEventsPage-1].ID
		out.NextBefore = &next
	}
	if out.Events == nil {
		out.Events = []staffEventRow{}
	}
	writeJSON(w, http.StatusOK, out)
}
