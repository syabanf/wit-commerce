package kernel

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// AuditInfo is what the HTTP layer knows about a staff or API key request: the reducer action the
// route runs, the request id and the caller's address.
type AuditInfo struct {
	Action    string
	RequestID string
	IP        string
}

type auditKey struct{}

// WithAudit marks a context so every action run with it writes an audit_log row. Only staff users
// and API keys are recorded: shopper writes are their own orders and account, already stamped on
// the order timeline, and logging them would copy shopper data into a five-year table.
func WithAudit(ctx context.Context, info AuditInfo) context.Context {
	info.IP = TruncateIP(info.IP)
	return context.WithValue(ctx, auditKey{}, info)
}

// TruncateIP keeps the network of an address: the /24 of IPv4 and the /48 of IPv6. Anything that
// does not parse is dropped.
func TruncateIP(addr string) string {
	if host, _, err := net.SplitHostPort(addr); err == nil {
		addr = host
	}
	ip := net.ParseIP(strings.TrimSpace(addr))
	switch {
	case ip == nil:
		return ""
	case ip.To4() != nil:
		return ip.Mask(net.CIDRMask(24, 32)).String() + "/24"
	default:
		return ip.Mask(net.CIDRMask(48, 128)).String() + "/48"
	}
}

// appendOnly collections only ever gain rows, so a put there is a create and needs no before read.
var appendOnly = map[string]bool{
	"stockMoves": true, "modifierStockMoves": true, "customerEvents": true, "integrationLogs": true,
	"traffic": true, "searchTerms": true,
}

type rowKey struct{ collection, id string }

type auditSegment struct {
	action string
	keys   []rowKey
	// entity, when set, is the record the row is about even if only rows around it changed.
	entity *rowKey
}

// auditTrail collects the rows an action changes, with each row as it stood before the action.
type auditTrail struct {
	info     AuditInfo
	p        auth.Principal
	segments []*auditSegment
	before   map[rowKey]json.RawMessage
	after    map[rowKey]json.RawMessage
}

func newTrail(ctx context.Context) *auditTrail {
	info, ok := ctx.Value(auditKey{}).(AuditInfo)
	p, _ := auth.From(ctx)
	if !ok || info.Action == "" || (p.Kind != auth.KindUser && p.Kind != auth.KindAPIKey) {
		return nil
	}
	return &auditTrail{
		info: info, p: p, segments: []*auditSegment{{action: info.Action}},
		before: map[rowKey]json.RawMessage{}, after: map[rowKey]json.RawMessage{},
	}
}

// AuditAs starts a new audit row inside this action: rows written after it are recorded under the
// action name given. A bulk action such as an import calls it once per item, so each item gets its
// own row and diff, about the record named by collection and id: a product whose stock alone
// changed still finds the row in its history. It does nothing when the action is not audited.
func (t *Tx) AuditAs(action, collection, id string) {
	if t.audit != nil {
		t.audit.segments = append(t.audit.segments, &auditSegment{action: action, entity: &rowKey{collection, id}})
	}
}

// track reads a row's state before its first write in this action.
func (a *auditTrail) track(t *Tx, collection, id string) error {
	k := rowKey{collection, id}
	seg := a.segments[len(a.segments)-1]
	if !slices.Contains(seg.keys, k) {
		seg.keys = append(seg.keys, k)
	}
	if _, seen := a.before[k]; seen {
		return nil
	}
	a.before[k] = nil
	if appendOnly[collection] {
		return nil
	}
	var raw []byte
	err := t.QueryRow(t.Ctx, `select data from `+store.Tables[collection]+` where id = $1`, id).Scan(&raw)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return nil
	case err != nil:
		return err
	}
	a.before[k] = raw
	return nil
}

func (a *auditTrail) wrote(collection, id string, v any) {
	raw, err := json.Marshal(v)
	if err == nil {
		a.after[rowKey{collection, id}] = raw
	}
}

func (a *auditTrail) removed(collection, id string) { a.after[rowKey{collection, id}] = nil }

// Limits that keep one audit row small.
const (
	auditMaxRows  = 30
	auditMaxValue = 200
)

// AuditChange is one row an action touched: op is create, update or delete. Fields holds each
// changed top-level field as {"before": x, "after": y}, or the string "changed" when the value is
// personal, secret or too large to keep. Past auditMaxRows rows, a last entry with op "more" counts
// the rows left out.
type AuditChange struct {
	Collection string         `json:"collection"`
	ID         string         `json:"id"`
	Op         string         `json:"op"`
	Fields     map[string]any `json:"fields,omitempty"`
	More       int            `json:"more,omitempty"`
}

type auditEntry struct {
	action, collection, tenantID string
	ids, refs                    []string
	changes                      []AuditChange
}

// entries turns the trail into one entry per segment that changed anything.
func (a *auditTrail) entries() []auditEntry {
	var out []auditEntry
	for _, seg := range a.segments {
		var changed []rowKey
		for _, k := range seg.keys {
			if !sameJSON(a.before[k], a.after[k]) {
				changed = append(changed, k)
			}
		}
		if len(changed) == 0 {
			continue
		}
		primary := primaryCollection(seg.action, changed)
		e := auditEntry{action: seg.action, collection: primary}
		if seg.entity != nil {
			primary, e.collection, e.ids = seg.entity.collection, seg.entity.collection, []string{seg.entity.id}
			if !slices.Contains(changed, *seg.entity) {
				e.refs = append(e.refs, seg.entity.collection+":"+seg.entity.id)
			}
		}
		for _, k := range changed {
			e.refs = append(e.refs, k.collection+":"+k.id)
			if k.collection == primary && seg.entity == nil {
				e.ids = append(e.ids, k.id)
			}
			if e.tenantID == "" {
				e.tenantID = rowTenant(k, a.after[k], a.before[k])
			}
		}
		for i, k := range changed {
			if i == auditMaxRows {
				e.changes = append(e.changes, AuditChange{Op: "more", More: len(changed) - auditMaxRows})
				break
			}
			e.changes = append(e.changes, diff(k, a.before[k], a.after[k], k.collection == primary))
		}
		out = append(out, e)
	}
	return out
}

// primaryCollection is the collection the action is named after, products for products/save,
// when the action touched it; otherwise the first collection it touched.
func primaryCollection(action string, keys []rowKey) string {
	prefix, _, _ := strings.Cut(action, "/")
	for _, k := range keys {
		if k.collection == prefix {
			return prefix
		}
	}
	return keys[0].collection
}

func rowTenant(k rowKey, rows ...json.RawMessage) string {
	if k.collection == "tenants" {
		return k.id
	}
	for _, raw := range rows {
		var keys struct {
			TenantID  string   `json:"tenantId"`
			TenantIDs []string `json:"tenantIds"`
		}
		if json.Unmarshal(raw, &keys) != nil {
			continue
		}
		if keys.TenantID != "" {
			return keys.TenantID
		}
		if len(keys.TenantIDs) == 1 {
			return keys.TenantIDs[0]
		}
	}
	return ""
}

func sameJSON(a, b json.RawMessage) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	var x, y any
	if json.Unmarshal(a, &x) != nil || json.Unmarshal(b, &y) != nil {
		return bytes.Equal(a, b)
	}
	cx, _ := json.Marshal(x)
	cy, _ := json.Marshal(y)
	return bytes.Equal(cx, cy)
}

// diff describes one changed row. Creates list their small fields only for the action's own
// entity; rows it writes along the way (moves, events) carry just their id.
func diff(k rowKey, before, after json.RawMessage, primary bool) AuditChange {
	c := AuditChange{Collection: k.collection, ID: k.id}
	var b, a map[string]any
	_ = json.Unmarshal(before, &b)
	_ = json.Unmarshal(after, &a)
	switch {
	case before == nil:
		c.Op = "create"
		if primary {
			c.Fields = map[string]any{}
			for f, v := range a {
				if skipField(f) || v == nil || v == "" {
					continue
				}
				if redacted(k.collection, f, v) {
					c.Fields[f] = "changed"
				} else if scalar(v) {
					c.Fields[f] = map[string]any{"after": v}
				}
			}
		}
	case after == nil:
		c.Op = "delete"
	default:
		c.Op = "update"
		c.Fields = map[string]any{}
		for f := range union(b, a) {
			if skipField(f) || sameValue(b[f], a[f]) {
				continue
			}
			if redacted(k.collection, f, b[f]) || redacted(k.collection, f, a[f]) {
				c.Fields[f] = "changed"
			} else {
				c.Fields[f] = map[string]any{"before": b[f], "after": a[f]}
			}
		}
	}
	if len(c.Fields) == 0 {
		c.Fields = nil
	}
	return c
}

func scalar(v any) bool {
	switch v.(type) {
	case map[string]any, []any:
		return false
	}
	return true
}

func union(a, b map[string]any) map[string]bool {
	out := map[string]bool{}
	for k := range a {
		out[k] = true
	}
	for k := range b {
		out[k] = true
	}
	return out
}

func sameValue(a, b any) bool {
	x, _ := json.Marshal(a)
	y, _ := json.Marshal(b)
	return bytes.Equal(x, y)
}

func skipField(f string) bool { return f == "id" || f == "tenantId" || f == "updatedAt" }

// personalCollections hold people: their names, notes and cities are personal too.
var personalCollections = map[string]bool{"customers": true, "users": true, "leads": true, "tickets": true, "sellers": true}

// secretWords and personalWords mark a field, at any depth, whose value is never stored.
var (
	secretWords   = []string{"password", "hash", "secret", "token", "apikey", "otp"}
	personalWords = []string{"email", "phone", "whatsapp", "address", "street", "postal", "nik", "npwp", "birth", "recipient"}
	personalNames = []string{"customer", "recipient", "contact", "buyer", "full", "first", "last"}
	// freeText fields hold whatever a person typed, which can name or reach someone.
	freeText = []string{"note", "notes", "label", "body", "message", "text", "comment", "reason", "description", "subject", "question", "answer"}
)

// sensitiveKey reports whether a field name holds a secret, personal data or free text.
func sensitiveKey(collection, f string) bool {
	k := strings.ToLower(f)
	for _, w := range secretWords {
		if strings.Contains(k, w) {
			return true
		}
	}
	for _, w := range personalWords {
		if strings.Contains(k, w) {
			return true
		}
	}
	if k == "ip" {
		return true
	}
	for _, w := range freeText {
		if k == w || strings.HasSuffix(k, w) {
			return true
		}
	}
	if strings.HasSuffix(k, "name") {
		for _, w := range personalNames {
			if strings.Contains(k, w) {
				return true
			}
		}
	}
	return personalCollections[collection] && (k == "name" || k == "city" || k == "tags" || k == "interests")
}

// redacted reports whether a value must be stored as "changed": a sensitive field, a value with a
// sensitive field inside, or one over auditMaxValue bytes.
func redacted(collection, f string, v any) bool {
	if sensitiveKey(collection, f) || sensitiveInside(collection, v) {
		return true
	}
	raw, _ := json.Marshal(v)
	return len(raw) > auditMaxValue
}

func sensitiveInside(collection string, v any) bool {
	switch x := v.(type) {
	case map[string]any:
		for k, inner := range x {
			if sensitiveKey(collection, k) || sensitiveInside(collection, inner) {
				return true
			}
		}
	case []any:
		for _, inner := range x {
			if sensitiveInside(collection, inner) {
				return true
			}
		}
	}
	return false
}

// writeAudit inserts the trail's rows in the action's transaction.
func (t *Tx) writeAudit() error {
	a := t.audit
	entries := a.entries()
	if len(entries) == 0 {
		return nil
	}
	kind, apiKey, name := "user", any(nil), ""
	if a.p.Kind == auth.KindAPIKey {
		kind, apiKey = "api_key", a.p.ID
		_ = t.QueryRow(t.Ctx, `select name from api_credentials where id = $1`, a.p.ID).Scan(&name)
	} else {
		_ = t.QueryRow(t.Ctx, `select coalesce(data->>'name', '') from users where id = $1`, a.p.ID).Scan(&name)
	}
	for _, e := range entries {
		changes, err := json.Marshal(e.changes)
		if err != nil {
			return err
		}
		if _, err := t.Exec(t.Ctx, `insert into audit_log (tenant_id, actor_kind, actor_id, actor_name, actor_role, api_key_id,
			action, entity_collection, entity_ids, refs, changes, request_id, ip)
			values (nullif($1, ''), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
			e.tenantID, kind, a.p.ID, name, a.p.Role, apiKey, e.action, e.collection, e.ids, e.refs, changes,
			a.info.RequestID, a.info.IP); err != nil {
			return err
		}
	}
	return nil
}
