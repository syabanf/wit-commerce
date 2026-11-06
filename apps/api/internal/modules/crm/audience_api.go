package crm

import (
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/readmodel"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
)

// SegmentAudience lists the tenant's customers in a segment at now, in id order. The segment rules
// read the customer_metrics read model, so no order or event is loaded. A missing segment has no
// audience.
func SegmentAudience(t *kernel.Tx, tenantID, segmentID string, now int64) ([]domain.Customer, error) {
	segment, err := kernel.Get[domain.Segment](t, "segments", segmentID, "segment")
	if err != nil {
		if _, missing := err.(kernel.NotFound); missing {
			return nil, nil
		}
		return nil, err
	}
	metrics, err := readmodel.TenantCustomerMetrics(t.Ctx, t.Tx, tenantID)
	if err != nil {
		return nil, err
	}
	rows := make([]rules.MetricsRow, len(metrics))
	for i, m := range metrics {
		rows[i] = rules.MetricsRow{
			CustomerID: m.CustomerID, Orders: m.Orders, Spend: int(m.Spend),
			FirstAt: ms(m.FirstAt), LastAt: ms(m.LastAt),
			LastAbandonedAt: ms(m.LastAbandonedAt), LastPurchaseEventAt: ms(m.LastPurchaseEventAt),
		}
	}
	ctx := rules.SegmentContextFromRows(rows, now)
	customers, err := kernel.TenantRows[domain.Customer](t, "customers", tenantID)
	if err != nil {
		return nil, err
	}
	var out []domain.Customer
	for _, c := range customers {
		if rules.InSegment(segment, c, ctx) {
			out = append(out, c)
		}
	}
	return out, nil
}

func ms(at *time.Time) int64 {
	if at == nil {
		return 0
	}
	return at.UnixMilli()
}
