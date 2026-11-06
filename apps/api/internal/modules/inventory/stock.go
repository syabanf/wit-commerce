package inventory

import (
	"context"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/catalog"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// ReceiveInput is stock/receive and modifierStock/receive.
type ReceiveInput struct {
	TenantID    string `json:"tenantId"`
	ProductID   string `json:"productId,omitempty"`
	VariantID   string `json:"variantId,omitempty"`
	GroupID     string `json:"groupId,omitempty"`
	OptionID    string `json:"optionId,omitempty"`
	WarehouseID string `json:"warehouseId"`
	Qty         int    `json:"qty"`
	Note        string `json:"note"`
}

// AdjustStock is stock/adjust.
func (s *Inventory) AdjustStock(ctx context.Context, m kernel.Meta, levelID string, delta int, note string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		l, err := kernel.Lock[domain.StockLevel](t, "stock", levelID, "stock level")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, l.TenantID); err != nil {
			return err
		}
		if why := rules.StockAdjustBlocker(l.OnHand, l.Reserved, delta); why != "" {
			return kernel.Refuse(why)
		}
		l.OnHand += delta
		if err := t.Put("stock", l.ID, l); err != nil {
			return err
		}
		move := domain.StockMove{
			ID: ids.New("mv"), TenantID: l.TenantID, VariantID: l.VariantID, WarehouseID: l.WarehouseID,
			Kind: "adjustment", Qty: delta, At: m.At, By: m.By(), Note: note,
		}
		return t.Put("stockMoves", move.ID, move)
	})
}

// AdjustModifierStock is modifierStock/adjust.
func (s *Inventory) AdjustModifierStock(ctx context.Context, m kernel.Meta, levelID string, delta int, note string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		l, err := kernel.Lock[domain.ModifierStockLevel](t, "modifierStock", levelID, "modifier stock level")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, l.TenantID); err != nil {
			return err
		}
		if why := rules.StockAdjustBlocker(l.OnHand, l.Reserved, delta); why != "" {
			return kernel.Refuse(why)
		}
		l.OnHand += delta
		if err := t.Put("modifierStock", l.ID, l); err != nil {
			return err
		}
		move := domain.ModifierStockMove{
			ID: ids.New("mmv"), TenantID: l.TenantID, GroupID: l.GroupID, OptionID: l.OptionID,
			WarehouseID: l.WarehouseID, Kind: "adjustment", Qty: delta, At: m.At, By: m.By(), Note: note,
		}
		return t.Put("modifierStockMoves", move.ID, move)
	})
}

func warehouseOf(t *kernel.Tx, tenantID, warehouseID string) error {
	w, err := store.Get[domain.Warehouse](t.Ctx, t.Tx, "warehouses", warehouseID)
	if err != nil || w.TenantID != tenantID {
		return kernel.Invalid{Reason: "Choose a warehouse of this store."}
	}
	return nil
}

// ReceiveStock is stock/receive: a receipt adds to the level or opens one.
func (s *Inventory) ReceiveStock(ctx context.Context, m kernel.Meta, in ReceiveInput) (*kernel.Delta, error) {
	if err := kernel.Access(m, in.TenantID); err != nil {
		return nil, err
	}
	if in.Qty <= 0 {
		return nil, kernel.Invalid{Reason: "Enter how many units arrived."}
	}
	return s.Run(ctx, func(t *kernel.Tx) error {
		p, err := catalog.Product(t, in.ProductID)
		if err != nil || p.TenantID != in.TenantID {
			return kernel.Invalid{Reason: "Choose a product of this store."}
		}
		hasVariant := false
		for _, v := range p.Variants {
			hasVariant = hasVariant || v.ID == in.VariantID
		}
		if !hasVariant {
			return kernel.Invalid{Reason: "Choose a variant of this product."}
		}
		if err := warehouseOf(t, in.TenantID, in.WarehouseID); err != nil {
			return err
		}
		levels, err := store.List[domain.StockLevel](t.Ctx, t.Tx, "stock",
			"variant_id = $1 and warehouse_id = $2 for update", in.VariantID, in.WarehouseID)
		if err != nil {
			return err
		}
		var level domain.StockLevel
		if len(levels) > 0 {
			level = levels[0]
			level.OnHand += in.Qty
		} else {
			level = domain.StockLevel{
				ID: ids.New("stk"), TenantID: in.TenantID, ProductID: in.ProductID, VariantID: in.VariantID,
				WarehouseID: in.WarehouseID, OnHand: in.Qty, Reserved: 0, Safety: 5,
			}
		}
		if err := t.Put("stock", level.ID, level); err != nil {
			return err
		}
		move := domain.StockMove{
			ID: ids.New("mv"), TenantID: in.TenantID, VariantID: in.VariantID, WarehouseID: in.WarehouseID,
			Kind: "receipt", Qty: in.Qty, At: m.At, By: m.By(), Note: in.Note,
		}
		return t.Put("stockMoves", move.ID, move)
	})
}

// ReceiveModifierStock is modifierStock/receive.
func (s *Inventory) ReceiveModifierStock(ctx context.Context, m kernel.Meta, in ReceiveInput) (*kernel.Delta, error) {
	if err := kernel.Access(m, in.TenantID); err != nil {
		return nil, err
	}
	if in.Qty <= 0 {
		return nil, kernel.Invalid{Reason: "Enter how many units arrived."}
	}
	return s.Run(ctx, func(t *kernel.Tx) error {
		g, err := catalog.ModifierGroup(t, in.GroupID)
		if err != nil || g.TenantID != in.TenantID || !catalog.Tracked(g, in.OptionID) {
			return kernel.Invalid{Reason: "Choose a stock-tracked option of this store."}
		}
		if err := warehouseOf(t, in.TenantID, in.WarehouseID); err != nil {
			return err
		}
		levels, err := store.List[domain.ModifierStockLevel](t.Ctx, t.Tx, "modifierStock",
			"option_id = $1 and warehouse_id = $2 for update", in.OptionID, in.WarehouseID)
		if err != nil {
			return err
		}
		var level domain.ModifierStockLevel
		if len(levels) > 0 {
			level = levels[0]
			level.OnHand += in.Qty
		} else {
			level = domain.ModifierStockLevel{
				ID: ids.New("mstk"), TenantID: in.TenantID, GroupID: in.GroupID, OptionID: in.OptionID,
				WarehouseID: in.WarehouseID, OnHand: in.Qty, Reserved: 0, Safety: 5,
			}
		}
		if err := t.Put("modifierStock", level.ID, level); err != nil {
			return err
		}
		move := domain.ModifierStockMove{
			ID: ids.New("mmv"), TenantID: in.TenantID, GroupID: in.GroupID, OptionID: in.OptionID,
			WarehouseID: in.WarehouseID, Kind: "receipt", Qty: in.Qty, At: m.At, By: m.By(), Note: in.Note,
		}
		return t.Put("modifierStockMoves", move.ID, move)
	})
}

// StockAt loads and locks the levels of one warehouse, plus everything the blockers read.
func StockAt(t *kernel.Tx, tenantID, warehouseID string) (stock []domain.StockLevel, modifierStock []domain.ModifierStockLevel, err error) {
	stock, err = store.List[domain.StockLevel](t.Ctx, t.Tx, "stock",
		"tenant_id = $1 and warehouse_id = $2 for update", tenantID, warehouseID)
	if err != nil {
		return nil, nil, err
	}
	modifierStock, err = store.List[domain.ModifierStockLevel](t.Ctx, t.Tx, "modifierStock",
		"tenant_id = $1 and warehouse_id = $2 for update", tenantID, warehouseID)
	return stock, modifierStock, err
}
