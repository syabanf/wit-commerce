package marketing

import (
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// RedeemPromotions counts one use, and the order's total as revenue, for every promotion the
// order earned: each discount line's promotion, or the voucher code on an order without lines.
func RedeemPromotions(t *kernel.Tx, o domain.Order) error {
	// Only the promotions the order can have earned are locked, so checkouts on other promotions
	// do not wait for this one.
	ids := make([]string, len(o.DiscountLines))
	for i, d := range o.DiscountLines {
		ids[i] = d.PromotionID
	}
	var code *string
	if o.DiscountLines == nil {
		code = o.VoucherCode
	}
	if len(ids) == 0 && code == nil {
		return nil
	}
	promotions, err := store.List[domain.Promotion](t.Ctx, t.Tx, "promotions",
		"tenant_id = $1 and (id = any($2) or data->>'code' = $3) for update", o.TenantID, ids, code)
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

// UsageSpent locks the promotions the order earned and reports whether one reached its usage limit
// after the order was priced, so two checkouts cannot both take its last use.
func UsageSpent(t *kernel.Tx, o domain.Order) (bool, error) {
	ids := make([]string, len(o.DiscountLines))
	for i, d := range o.DiscountLines {
		ids[i] = d.PromotionID
	}
	if len(ids) == 0 {
		return false, nil
	}
	promotions, err := store.List[domain.Promotion](t.Ctx, t.Tx, "promotions",
		"tenant_id = $1 and id = any($2) for update", o.TenantID, ids)
	if err != nil {
		return false, err
	}
	for _, p := range promotions {
		if p.UsageLimit != nil && p.Used >= *p.UsageLimit {
			return true, nil
		}
	}
	return false, nil
}
