package rules

import "github.com/syabanf/wit-commerce/apps/api/internal/clock"

// MetricsRow is one customer's metrics as the read model keeps them, in milliseconds. A zero time
// means the moment never happened.
type MetricsRow struct {
	CustomerID          string
	Orders              int
	Spend               int
	FirstAt             int64
	LastAt              int64
	LastAbandonedAt     int64
	LastPurchaseEventAt int64
}

// SegmentContextFromRows mirrors segmentContextFromRows: the same context NewSegmentContext builds,
// read from metrics rows instead of every order and event.
func SegmentContextFromRows(rows []MetricsRow, now int64) SegmentContext {
	ctx := SegmentContext{metrics: map[string]*CustomerMetrics{}, abandoned: map[string]bool{}}
	for _, r := range rows {
		if r.Orders > 0 {
			ctx.metrics[r.CustomerID] = &CustomerMetrics{
				Orders: r.Orders, Spend: r.Spend, FirstAt: r.FirstAt, LastAt: r.LastAt,
				DaysSinceLast: int((now - r.LastAt) / clock.Day), HasOrders: true,
			}
		}
		if r.LastAbandonedAt > r.LastPurchaseEventAt && now-r.LastAbandonedAt <= 7*clock.Day {
			ctx.abandoned[r.CustomerID] = true
		}
	}
	return ctx
}
