package rules

import (
	"fmt"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// SegmentSQL mirrors InSegment as a SQL condition, so Postgres can count a segment without the API
// loading every customer. It reads a customers row as c and its customer_metrics row, left joined,
// as m, the way SegmentContextFromRows reads them. now is the number of the parameter that holds
// the moment in milliseconds; values the rules compare go on the end of args.
func SegmentSQL(s domain.Segment, now int, args *[]any) string {
	if len(s.Rules) == 0 {
		return "false"
	}
	parts := make([]string, 0, len(s.Rules))
	for _, r := range s.Rules {
		parts = append(parts, ruleSQL(r, now, args))
	}
	joiner := " or "
	if s.Match == "all" {
		joiner = " and "
	}
	return "(" + strings.Join(parts, joiner) + ")"
}

// AbandonedSQL mirrors the abandoned set of SegmentContextFromRows: a checkout left in the last
// seven days with no purchase after it.
func AbandonedSQL(now int) string {
	abandonedAt, purchasedAt := millis("m.last_abandoned_at"), millis("m.last_purchase_event_at")
	return fmt.Sprintf("(%s > %s and $%d - %s <= %d)", abandonedAt, purchasedAt, now, abandonedAt, 7*clock.Day)
}

// millis is a timestamp column in whole milliseconds, 0 when it never happened.
func millis(column string) string {
	return "coalesce(floor(extract(epoch from " + column + ") * 1000)::bigint, 0)"
}

func ruleSQL(r domain.SegmentRule, now int, args *[]any) string {
	arg := func(v any) string {
		*args = append(*args, v)
		return fmt.Sprintf("$%d", len(*args))
	}
	number := func(actual string) string {
		op := "="
		switch r.Op {
		case "gt":
			op = ">"
		case "lt":
			op = "<"
		}
		return fmt.Sprintf("%s %s %s::bigint", actual, op, arg(atoi(r.Value)))
	}
	const hasOrders = "coalesce(m.orders, 0) > 0"
	switch r.Field {
	case "orders":
		return number("coalesce(m.orders, 0)")
	case "spend":
		return number("(case when " + hasOrders + " then m.spend else 0 end)")
	case "days_since_purchase":
		return "(" + hasOrders + " and " + number(fmt.Sprintf("(($%d - %s) / %d)", now, millis("m.last_at"), clock.Day)) + ")"
	case "tier", "stage", "city":
		return fmt.Sprintf("coalesce(c.data->>'%s', '') = %s", r.Field, arg(r.Value))
	case "interest":
		return fmt.Sprintf("coalesce(c.data->'interests', '[]'::jsonb) @> to_jsonb(%s::text)", arg(r.Value))
	case "abandoned_cart":
		if r.Value == "yes" {
			return AbandonedSQL(now)
		}
		return "not " + AbandonedSQL(now)
	}
	return "false"
}
