package inventory

import (
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/catalog"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
)

// Lookup loads what the order blockers read for the order's variants and modifier options at its
// warehouse, locking those stock rows. Orders for other variants of the same warehouse do not wait.
func Lookup(t *kernel.Tx, o domain.Order) (rules.StockLookup, error) {
	variants, options := rules.VariantDemand(o).Keys, rules.ModifierDemand(o).Keys
	stock, modifierStock, err := StockAt(t, o.TenantID, o.WarehouseID, variants, options)
	if err != nil {
		return rules.StockLookup{}, err
	}
	modifiers, err := catalog.ModifierGroupsWithOptions(t, o.TenantID, options)
	if err != nil {
		return rules.StockLookup{}, err
	}
	products, err := catalog.ProductsWithVariants(t, o.TenantID, variants)
	if err != nil {
		return rules.StockLookup{}, err
	}
	return rules.StockLookup{Stock: stock, ModifierStock: modifierStock, Modifiers: modifiers, Products: products}, nil
}

// Reserve changes the reservation of every level the order needs at its warehouse: +1 on place,
// -1 on cancel or expiry. ship also takes the units off the shelf.
func Reserve(t *kernel.Tx, l rules.StockLookup, o domain.Order, sign int, ship bool) error {
	demand := rules.VariantDemand(o)
	for _, s := range l.Stock {
		qty := demand.Qty[s.VariantID]
		if qty == 0 {
			continue
		}
		if ship {
			s.OnHand = max(0, s.OnHand-qty)
			s.Reserved = max(0, s.Reserved-qty)
		} else if sign > 0 {
			s.Reserved += qty
		} else {
			s.Reserved = max(0, s.Reserved-qty)
		}
		if err := t.Put("stock", s.ID, s); err != nil {
			return err
		}
	}
	modifiers := rules.ModifierDemand(o)
	for _, s := range l.ModifierStock {
		qty := modifiers.Qty[s.OptionID]
		if qty == 0 {
			continue
		}
		if ship {
			s.OnHand = max(0, s.OnHand-qty)
			s.Reserved = max(0, s.Reserved-qty)
		} else if sign > 0 {
			s.Reserved += qty
		} else {
			s.Reserved = max(0, s.Reserved-qty)
		}
		if err := t.Put("modifierStock", s.ID, s); err != nil {
			return err
		}
	}
	return nil
}
