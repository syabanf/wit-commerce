package readmodel

import (
	"context"
	"fmt"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
)

// SegmentCounts counts each segment's customers, and the customers with an abandoned checkout in the
// last seven days, in one scan of the customers table joined to customer_metrics. The counts equal
// rules.AudienceSize over SegmentContextFromRows, without loading a customer into memory. sellers,
// when not nil, keeps a sales user's assigned customers only.
func SegmentCounts(ctx context.Context, q Querier, tenantID string, segments []domain.Segment, sellers []string, nowMs int64) ([]int, int, error) {
	args := []any{tenantID, nowMs}
	where := "c.tenant_id = $1"
	if sellers != nil {
		args = append(args, sellers)
		where += fmt.Sprintf(" and c.seller_id = any($%d)", len(args))
	}
	cols := []string{"count(*) filter (where " + rules.AbandonedSQL(2) + ")"}
	for _, seg := range segments {
		cols = append(cols, "count(*) filter (where "+rules.SegmentSQL(seg, 2, &args)+")")
	}
	counts := make([]int, len(cols))
	dest := make([]any, len(cols))
	for i := range counts {
		dest[i] = &counts[i]
	}
	err := q.QueryRow(ctx, `select `+strings.Join(cols, ", ")+`
		from customers c left join customer_metrics m on m.customer_id = c.id where `+where, args...).Scan(dest...)
	if err != nil {
		return nil, 0, err
	}
	return counts[1:], counts[0], nil
}

// SegmentReach counts a segment's customers and those of them a marketing message may go to, in
// one scan, as SegmentAudience filtered by rules.MarketingAllowed would. The cast on $2 types the
// moment when no rule reads it.
func SegmentReach(ctx context.Context, q Querier, tenantID string, segment domain.Segment, nowMs int64) (inSegment, reach int, err error) {
	args := []any{tenantID, nowMs}
	in := rules.SegmentSQL(segment, 2, &args)
	err = q.QueryRow(ctx, `select count(*) filter (where `+in+`), count(*) filter (where `+in+` and `+rules.MarketingAllowedSQL+`)
		from customers c left join customer_metrics m on m.customer_id = c.id
		where c.tenant_id = $1 and $2::bigint is not null`, args...).Scan(&inSegment, &reach)
	return inSegment, reach, err
}
