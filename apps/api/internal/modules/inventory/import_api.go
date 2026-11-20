package inventory

import (
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// What the product CSV import and export in the service need, inside the caller's action.

// TenantWarehouses lists a tenant's warehouses, in id order.
func TenantWarehouses(t *kernel.Tx, tenantID string) ([]domain.Warehouse, error) {
	return kernel.TenantRows[domain.Warehouse](t, "warehouses", tenantID)
}

// TenantStock lists a tenant's stock levels, in id order.
func TenantStock(t *kernel.Tx, tenantID string) ([]domain.StockLevel, error) {
	return kernel.TenantRows[domain.StockLevel](t, "stock", tenantID)
}

// SetOnHand brings a variant's on-hand count in one warehouse to onHand, as stock/adjust does for a
// level that exists and stock/receive for one that does not. Setting a missing level to 0 does
// nothing. The move carries the note.
func SetOnHand(t *kernel.Tx, m kernel.Meta, tenantID, productID, variantID, warehouseID string, onHand int, note string) error {
	if err := kernel.Access(m, tenantID); err != nil {
		return err
	}
	levels, err := store.List[domain.StockLevel](t.Ctx, t.Tx, "stock",
		"variant_id = $1 and warehouse_id = $2 for update", variantID, warehouseID)
	if err != nil {
		return err
	}
	kind := "adjustment"
	var level domain.StockLevel
	if len(levels) > 0 {
		level = levels[0]
	} else {
		if onHand == 0 {
			return nil
		}
		kind = "receipt"
		level = domain.StockLevel{
			ID: ids.New("stk"), TenantID: tenantID, ProductID: productID, VariantID: variantID,
			WarehouseID: warehouseID, Safety: 5,
		}
	}
	delta := onHand - level.OnHand
	if delta == 0 {
		return nil
	}
	if why := rules.StockAdjustBlocker(level.OnHand, level.Reserved, delta); why != "" {
		return kernel.Refuse(why)
	}
	level.OnHand = onHand
	if err := t.Put("stock", level.ID, level); err != nil {
		return err
	}
	move := domain.StockMove{
		ID: ids.New("mv"), TenantID: tenantID, VariantID: variantID, WarehouseID: warehouseID,
		Kind: kind, Qty: delta, At: m.At, By: m.By(), Note: note,
	}
	return t.Put("stockMoves", move.ID, move)
}
