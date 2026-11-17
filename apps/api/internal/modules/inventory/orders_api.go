package inventory

import (
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// RecordShipment takes a shipped order's units off the shelf and out of reservation, and logs a
// sale move for every modifier option and variant it carried.
func RecordShipment(t *kernel.Tx, l rules.StockLookup, o domain.Order, at, by string) error {
	if err := Reserve(t, l, o, -1, true); err != nil {
		return err
	}
	modifiers := rules.ModifierDemand(o)
	for _, optionID := range modifiers.Keys {
		var level *domain.ModifierStockLevel
		for i := range l.ModifierStock {
			if l.ModifierStock[i].OptionID == optionID {
				level = &l.ModifierStock[i]
			}
		}
		if level == nil {
			continue
		}
		move := domain.ModifierStockMove{
			ID: ids.New("mmv"), TenantID: o.TenantID, GroupID: level.GroupID, OptionID: optionID,
			WarehouseID: o.WarehouseID, Kind: "sale", Qty: -modifiers.Qty[optionID], At: at, By: by, Note: o.Code,
		}
		if err := t.Put("modifierStockMoves", move.ID, move); err != nil {
			return err
		}
	}
	demand := rules.VariantDemand(o)
	for _, variantID := range demand.Keys {
		move := domain.StockMove{
			ID: ids.New("mv"), TenantID: o.TenantID, VariantID: variantID, WarehouseID: o.WarehouseID,
			Kind: "sale", Qty: -demand.Qty[variantID], At: at, By: by, Note: o.Code,
		}
		if err := t.Put("stockMoves", move.ID, move); err != nil {
			return err
		}
	}
	return nil
}

// Restock puts returned units back on the shelf of a warehouse and logs a return move for each. A
// variant with no level there is skipped: it was never tracked at that warehouse.
func Restock(t *kernel.Tx, tenantID, warehouseID string, items []domain.ReturnItem, note, at, by string) error {
	levels, err := store.List[domain.StockLevel](t.Ctx, t.Tx, "stock",
		"tenant_id = $1 and warehouse_id = $2 for update", tenantID, warehouseID)
	if err != nil {
		return err
	}
	for _, item := range items {
		for _, level := range levels {
			if level.VariantID != item.VariantID {
				continue
			}
			level.OnHand += item.Qty
			if err := t.Put("stock", level.ID, level); err != nil {
				return err
			}
			move := domain.StockMove{
				ID: ids.New("mv"), TenantID: tenantID, VariantID: item.VariantID, WarehouseID: warehouseID,
				Kind: "return", Qty: item.Qty, At: at, By: by, Note: note,
			}
			if err := t.Put("stockMoves", move.ID, move); err != nil {
				return err
			}
			break
		}
	}
	return nil
}
