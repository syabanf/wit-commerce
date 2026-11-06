package inventory

import (
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
)

// GroupModifierStock returns the stock levels of one modifier group, in store order.
func (s *Inventory) GroupModifierStock(t *kernel.Tx, tenantID, groupID string) ([]domain.ModifierStockLevel, error) {
	levels, err := kernel.TenantRows[domain.ModifierStockLevel](t, "modifierStock", tenantID)
	if err != nil {
		return nil, err
	}
	var out []domain.ModifierStockLevel
	for _, l := range levels {
		if l.GroupID == groupID {
			out = append(out, l)
		}
	}
	return out, nil
}

// DropModifierStock deletes these modifier stock levels, in this order.
func (s *Inventory) DropModifierStock(t *kernel.Tx, levelIDs []string) error {
	for _, id := range levelIDs {
		if err := t.Del("modifierStock", id); err != nil {
			return err
		}
	}
	return nil
}
