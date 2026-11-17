package ai

import (
	"encoding/json"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
)

// The checks for the actions that act on a record a lookup or the open page supplied. Each one
// decodes strictly, finds the record, applies the same blocker the API route applies and returns
// the reducer action's fields plus what the confirm card shows.

const (
	maxAdjust       = 10000
	maxSegmentRules = 5
)

var (
	cancelReasons = []string{"customer_request", "payment_expired", "out_of_stock", "fraud_check", "duplicate"}
	leadStageFlow = []string{"new", "qualified", "proposal", "negotiation", "won"}
	loyaltyTiers  = []string{"member", "silver", "gold", "platinum"}
	lifeStages    = []string{"visitor", "lead", "registered", "first_buyer", "repeat_buyer", "loyal", "vip", "at_risk", "dormant"}
	// toFulfil are the statuses the assistant may move an order on from.
	toFulfil = []string{"paid", "processing", "packed"}
)

// Advanceable reports whether the assistant may propose moving an order on from this status.
func Advanceable(status string) bool { return slices.Contains(toFulfil, status) }

// NextLeadStage is the stage after this one in the pipeline, or "" for a closed lead.
func NextLeadStage(stage string) string {
	if i := slices.Index(leadStageFlow, stage); i >= 0 && i < len(leadStageFlow)-1 {
		return leadStageFlow[i+1]
	}
	return ""
}

func checkOrderCancel(raw json.RawMessage, f AssistantFacts) (map[string]any, bool) {
	var p struct {
		ID     string `json:"id"`
		Reason string `json:"reason"`
		Note   string `json:"note"`
	}
	if !decodeParams(raw, &p) || !slices.Contains(cancelReasons, p.Reason) {
		return nil, false
	}
	o, ok := f.order(p.ID)
	if !ok || rules.OrderCancelBlocker(domain.Order{Status: o.Status}) != "" {
		return nil, false
	}
	// The same rule as orders/cancel: a paid order gets its whole total back.
	var refund int64
	if o.Payment == "paid" {
		refund = o.Total
	}
	return map[string]any{
		"id": o.ID, "reason": p.Reason, "note": clip(strings.TrimSpace(p.Note), maxNote), "code": o.Code,
		"status": o.Status, "payment": o.Payment, "total": o.Total, "refund": refund,
	}, true
}

func checkOrderNote(raw json.RawMessage, f AssistantFacts) (map[string]any, bool) {
	var p struct {
		ID   string `json:"id"`
		Note string `json:"note"`
	}
	if !decodeParams(raw, &p) {
		return nil, false
	}
	p.Note = strings.TrimSpace(p.Note)
	o, ok := f.order(p.ID)
	if !ok || p.Note == "" || utf8.RuneCountInString(p.Note) > maxNote {
		return nil, false
	}
	return map[string]any{"id": o.ID, "note": p.Note, "code": o.Code}, true
}

func checkTicketAssign(raw json.RawMessage, f AssistantFacts) (map[string]any, bool) {
	var p struct {
		ID       string `json:"id"`
		Assignee string `json:"assignee"`
	}
	if !decodeParams(raw, &p) {
		return nil, false
	}
	t, ok := f.ticket(p.ID)
	if !ok || t.Status == "resolved" {
		return nil, false
	}
	// The reducer takes a user id or null; "" stands for null on the wire to the console.
	assignee := ""
	switch {
	case p.Assignee == "me" && t.Assigned != AssignedYou && f.UserID != "":
		assignee = f.UserID
	case p.Assignee == "nobody" && t.Assigned != AssignedNobody:
	default:
		return nil, false
	}
	return map[string]any{"id": t.ID, "assigneeId": assignee, "code": t.Code, "subject": t.Subject, "from": t.Assigned}, true
}

func checkTicketResolve(raw json.RawMessage, f AssistantFacts) (map[string]any, bool) {
	var p struct {
		ID string `json:"id"`
	}
	if !decodeParams(raw, &p) {
		return nil, false
	}
	t, ok := f.ticket(p.ID)
	if !ok || t.Status == "resolved" {
		return nil, false
	}
	return map[string]any{"id": t.ID, "code": t.Code, "subject": t.Subject, "status": t.Status}, true
}

func checkLeadMove(raw json.RawMessage, f AssistantFacts) (map[string]any, bool) {
	var p struct {
		ID string `json:"id"`
	}
	if !decodeParams(raw, &p) {
		return nil, false
	}
	l, ok := f.lead(p.ID)
	next := NextLeadStage(l.Stage)
	if !ok || next == "" || rules.LeadMoveBlocker(domain.Lead{Stage: l.Stage, Value: l.Value}, next) != "" {
		return nil, false
	}
	return map[string]any{"id": l.ID, "stage": next, "from": l.Stage, "code": l.Code, "value": l.Value}, true
}

func checkCampaignLaunch(raw json.RawMessage, f AssistantFacts) (map[string]any, bool) {
	var p struct {
		ID string `json:"id"`
	}
	if !decodeParams(raw, &p) {
		return nil, false
	}
	c, ok := f.campaign(p.ID)
	if !ok || (c.Status != "draft" && c.Status != "paused") || c.LaunchBlocker != "" {
		return nil, false
	}
	// campaigns/launch schedules a campaign whose start is still ahead.
	to := "running"
	if start, err := time.Parse(time.RFC3339, c.StartAt); err == nil && start.After(f.Now) {
		to = "scheduled"
	}
	return map[string]any{"id": c.ID, "name": c.Name, "from": c.Status, "to": to, "startAt": c.StartAt}, true
}

func checkStockAdjust(raw json.RawMessage, f AssistantFacts) (map[string]any, bool) {
	var p struct {
		LevelID string `json:"levelId"`
		Delta   int    `json:"delta"`
		Reason  string `json:"reason"`
	}
	if !decodeParams(raw, &p) || p.Delta == 0 || p.Delta < -maxAdjust || p.Delta > maxAdjust {
		return nil, false
	}
	reason := clip(strings.TrimSpace(p.Reason), 120)
	level, ok := f.level(p.LevelID)
	if !ok || reason == "" || rules.StockAdjustBlocker(level.OnHand, level.Reserved, p.Delta) != "" {
		return nil, false
	}
	return map[string]any{
		"levelId": level.LevelID, "delta": p.Delta, "note": reason, "product": level.Product, "sku": level.SKU,
		"warehouse": level.Warehouse, "onHand": level.OnHand,
	}, true
}

func checkProductStatus(raw json.RawMessage, f AssistantFacts) (map[string]any, bool) {
	var p struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	if !decodeParams(raw, &p) {
		return nil, false
	}
	product, ok := f.product(p.ID)
	switch {
	case !ok || product.Status == p.Status:
		return nil, false
	case p.Status == "active" && product.ActivateBlocker == "":
	case p.Status == "archived":
	default:
		return nil, false
	}
	return map[string]any{"id": product.ID, "status": p.Status, "from": product.Status, "name": product.Name, "code": product.Code}, true
}

func checkNewSegment(raw json.RawMessage, _ AssistantFacts) (map[string]any, bool) {
	var p struct {
		Name        string               `json:"name"`
		Description string               `json:"description"`
		Match       string               `json:"match"`
		Rules       []domain.SegmentRule `json:"rules"`
	}
	if !decodeParams(raw, &p) {
		return nil, false
	}
	p.Name = strings.TrimSpace(p.Name)
	if p.Name == "" || utf8.RuneCountInString(p.Name) > 60 || (p.Match != "all" && p.Match != "any") ||
		len(p.Rules) == 0 || len(p.Rules) > maxSegmentRules {
		return nil, false
	}
	for i, rule := range p.Rules {
		rule.Value = strings.TrimSpace(rule.Value)
		if !validSegmentRule(rule) {
			return nil, false
		}
		p.Rules[i] = rule
	}
	return map[string]any{"name": p.Name, "description": clip(strings.TrimSpace(p.Description), maxReason), "match": p.Match, "rules": p.Rules}, true
}

// validSegmentRule keeps the rules the segment editor can show: a number compared, or one of a
// fixed set. Interest and city rules need the editor's pickers, so the assistant leaves them out.
func validSegmentRule(r domain.SegmentRule) bool {
	switch r.Field {
	case "orders", "spend", "days_since_purchase":
		n, err := strconv.Atoi(r.Value)
		return err == nil && n >= 0 && n <= 1_000_000_000 && strconv.Itoa(n) == r.Value && slices.Contains([]string{"gt", "lt", "eq"}, r.Op)
	case "tier":
		return r.Op == "eq" && slices.Contains(loyaltyTiers, r.Value)
	case "stage":
		return r.Op == "eq" && slices.Contains(lifeStages, r.Value)
	case "abandoned_cart":
		return r.Op == "eq" && (r.Value == "yes" || r.Value == "no")
	}
	return false
}
