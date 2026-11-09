package service

import (
	"context"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
)

// TenantSetup creates the store's first usable dataset in one transaction.
type TenantSetup struct {
	Tenant       domain.Tenant        `json:"tenant"`
	Page         domain.Page          `json:"page"`
	Categories   []domain.Category    `json:"categories"`
	Products     []domain.Product     `json:"products"`
	Warehouse    domain.Warehouse     `json:"warehouse"`
	Stock        []domain.StockLevel  `json:"stock"`
	PaymentTypes []domain.PaymentType `json:"paymentTypes"`
}

func (s *Service) SetupTenant(ctx context.Context, m Meta, in TenantSetup) (*Delta, error) {
	id := in.Tenant.ID
	if id == "" || strings.TrimSpace(in.Tenant.Name) == "" || in.Tenant.Subdomain == "" || in.Page.ID == "" || in.Warehouse.ID == "" || len(in.PaymentTypes) == 0 {
		return nil, kernel.Invalid{Reason: "Complete the business, store page, warehouse and payment settings."}
	}
	if in.Page.TenantID != id || in.Warehouse.TenantID != id || in.Page.Kind != "home" || in.Page.Slug != "/" {
		return nil, kernel.Invalid{Reason: "The initial page and warehouse must belong to the new tenant."}
	}
	for _, c := range in.Categories {
		if c.ID == "" || c.TenantID != id {
			return nil, kernel.Invalid{Reason: "A category does not belong to the new tenant."}
		}
	}
	for _, p := range in.Products {
		if p.ID == "" || p.TenantID != id {
			return nil, kernel.Invalid{Reason: "A product does not belong to the new tenant."}
		}
	}
	for _, st := range in.Stock {
		if st.ID == "" || st.TenantID != id || st.WarehouseID != in.Warehouse.ID {
			return nil, kernel.Invalid{Reason: "A stock row does not belong to the new warehouse."}
		}
	}
	for _, p := range in.PaymentTypes {
		if p.ID == "" || p.TenantID != id {
			return nil, kernel.Invalid{Reason: "A payment type does not belong to the new tenant."}
		}
	}
	return s.Run(ctx, func(t *kernel.Tx) error {
		if err := t.Put("tenants", id, in.Tenant); err != nil {
			return err
		}
		if err := t.Put("pages", in.Page.ID, in.Page); err != nil {
			return err
		}
		for _, c := range in.Categories {
			if err := t.Put("categories", c.ID, c); err != nil {
				return err
			}
		}
		for _, p := range in.Products {
			if err := t.Put("products", p.ID, p); err != nil {
				return err
			}
		}
		if err := t.Put("warehouses", in.Warehouse.ID, in.Warehouse); err != nil {
			return err
		}
		for _, st := range in.Stock {
			if err := t.Put("stock", st.ID, st); err != nil {
				return err
			}
		}
		for _, p := range in.PaymentTypes {
			if err := t.Put("paymentTypes", p.ID, p); err != nil {
				return err
			}
		}
		return nil
	})
}
