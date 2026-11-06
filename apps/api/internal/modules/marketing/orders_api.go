package marketing

import (
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// RedeemPromotions counts one use, and the order's total as revenue, for every promotion the
// order earned: each discount line's promotion, or the voucher code on an order without lines.
func RedeemPromotions(t *kernel.Tx, o domain.Order) error {
	promotions, err := store.List[domain.Promotion](t.Ctx, t.Tx, "promotions", "tenant_id = $1 for update", o.TenantID)
	if err != nil {
		return err
	}
	for _, p := range promotions {
		earned := false
		for _, d := range o.DiscountLines {
			earned = earned || d.PromotionID == p.ID
		}
		if o.DiscountLines == nil && o.VoucherCode != nil && p.Code == *o.VoucherCode {
			earned = true
		}
		if !earned {
			continue
		}
		p.Used++
		p.Revenue += o.Total
		if err := t.Put("promotions", p.ID, p); err != nil {
			return err
		}
	}
	return nil
}
