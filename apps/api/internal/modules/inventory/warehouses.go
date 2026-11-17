package inventory

import (
	"context"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
)

// WarehouseInput is a new warehouse for a brand.
type WarehouseInput struct {
	TenantID string `json:"tenantId"`
	Code     string `json:"code"`
	Name     string `json:"name"`
	City     string `json:"city"`
}

// CreateWarehouse adds a warehouse to a brand. Its code is unique within the brand.
func (s *Inventory) CreateWarehouse(ctx context.Context, m kernel.Meta, in WarehouseInput) (*kernel.Delta, error) {
	if err := kernel.Access(m, in.TenantID); err != nil {
		return nil, err
	}
	w := domain.Warehouse{
		ID: ids.New("wh"), TenantID: in.TenantID, Code: strings.ToUpper(strings.TrimSpace(in.Code)),
		Name: strings.TrimSpace(in.Name), City: strings.TrimSpace(in.City),
	}
	if w.Code == "" || len(w.Code) > 12 || w.Name == "" || len(w.Name) > 80 || w.City == "" || len(w.City) > 80 {
		return nil, kernel.Invalid{Reason: "Enter a code of up to 12 characters, a name and a city."}
	}
	return s.Run(ctx, func(t *kernel.Tx) error {
		existing, err := kernel.TenantRows[domain.Warehouse](t, "warehouses", in.TenantID)
		if err != nil {
			return err
		}
		for _, other := range existing {
			if other.Code == w.Code {
				return kernel.Refuse("Another warehouse of this store already uses the code " + w.Code + ".")
			}
		}
		return t.Put("warehouses", w.ID, w)
	})
}
