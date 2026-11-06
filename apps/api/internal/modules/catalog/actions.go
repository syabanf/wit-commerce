package catalog

import (
	"context"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
)

// SaveProduct is products/save.
func (s *Catalog) SaveProduct(ctx context.Context, m kernel.Meta, p domain.Product) (*kernel.Delta, error) {
	if err := kernel.Access(m, p.TenantID); err != nil {
		return nil, err
	}
	return s.Run(ctx, func(t *kernel.Tx) error { return t.Put("products", p.ID, p) })
}

// SetProductAttributes is products/setAttributes.
func (s *Catalog) SetProductAttributes(ctx context.Context, m kernel.Meta, id string, attributes map[string]string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		p, err := kernel.Lock[domain.Product](t, "products", id, "product")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, p.TenantID); err != nil {
			return err
		}
		if attributes == nil {
			attributes = map[string]string{}
		}
		p.Attributes = attributes
		return t.Put("products", p.ID, p)
	})
}

// SetProductStatus is products/setStatus.
func (s *Catalog) SetProductStatus(ctx context.Context, m kernel.Meta, id, status string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		p, err := kernel.Lock[domain.Product](t, "products", id, "product")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, p.TenantID); err != nil {
			return err
		}
		if status == "active" {
			defs, err := kernel.TenantRows[domain.AttributeDef](t, "attributes", p.TenantID)
			if err != nil {
				return err
			}
			categories, err := kernel.TenantRows[domain.Category](t, "categories", p.TenantID)
			if err != nil {
				return err
			}
			if why := rules.ProductActivateBlocker(p, rules.AttributesFor(p.CategoryID, defs, categories)); why != "" {
				return kernel.Refuse(why)
			}
		}
		p.Status = status
		return t.Put("products", p.ID, p)
	})
}

// SaveCategory is categories/save.
func (s *Catalog) SaveCategory(ctx context.Context, m kernel.Meta, c domain.Category) (*kernel.Delta, error) {
	if err := kernel.Access(m, c.TenantID); err != nil {
		return nil, err
	}
	return s.Run(ctx, func(t *kernel.Tx) error { return t.Put("categories", c.ID, c) })
}

// RemoveCategory is categories/remove: attributes scoped to it drop the reference.
func (s *Catalog) RemoveCategory(ctx context.Context, m kernel.Meta, id string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		c, err := kernel.Get[domain.Category](t, "categories", id, "category")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, c.TenantID); err != nil {
			return err
		}
		products, err := kernel.TenantRows[domain.Product](t, "products", c.TenantID)
		if err != nil {
			return err
		}
		categories, err := kernel.TenantRows[domain.Category](t, "categories", c.TenantID)
		if err != nil {
			return err
		}
		if why := rules.CategoryRemoveBlocker(c, products, categories); why != "" {
			return kernel.Refuse(why)
		}
		if err := t.Del("categories", c.ID); err != nil {
			return err
		}
		defs, err := kernel.TenantRows[domain.AttributeDef](t, "attributes", c.TenantID)
		if err != nil {
			return err
		}
		for _, d := range defs {
			kept := without(d.CategoryIDs, c.ID)
			if len(kept) == len(d.CategoryIDs) {
				continue
			}
			d.CategoryIDs = kept
			if err := t.Put("attributes", d.ID, d); err != nil {
				return err
			}
		}
		return nil
	})
}

// SaveAttribute is attributes/save.
func (s *Catalog) SaveAttribute(ctx context.Context, m kernel.Meta, a domain.AttributeDef) (*kernel.Delta, error) {
	if err := kernel.Access(m, a.TenantID); err != nil {
		return nil, err
	}
	return s.Run(ctx, func(t *kernel.Tx) error { return t.Put("attributes", a.ID, a) })
}

// RemoveAttribute is attributes/remove: products drop their value for it.
func (s *Catalog) RemoveAttribute(ctx context.Context, m kernel.Meta, id string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		a, err := kernel.Get[domain.AttributeDef](t, "attributes", id, "attribute")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, a.TenantID); err != nil {
			return err
		}
		if err := t.Del("attributes", a.ID); err != nil {
			return err
		}
		products, err := kernel.TenantRows[domain.Product](t, "products", a.TenantID)
		if err != nil {
			return err
		}
		for _, p := range products {
			if _, has := p.Attributes[a.ID]; !has {
				continue
			}
			delete(p.Attributes, a.ID)
			if err := t.Put("products", p.ID, p); err != nil {
				return err
			}
		}
		return nil
	})
}

// Tracked reports whether the group has a stock-tracked option with this id.
func Tracked(g domain.ModifierGroup, optionID string) bool {
	for _, o := range g.Options {
		if o.ID == optionID && o.Tracked() {
			return true
		}
	}
	return false
}

// SaveModifierGroup is modifiers/save: options with stock on hand cannot be dropped or untracked.
func (s *Catalog) SaveModifierGroup(ctx context.Context, m kernel.Meta, g domain.ModifierGroup) (*kernel.Delta, error) {
	if err := kernel.Access(m, g.TenantID); err != nil {
		return nil, err
	}
	return s.Run(ctx, func(t *kernel.Tx) error {
		levels, err := s.ModifierStock.GroupModifierStock(t, g.TenantID, g.ID)
		if err != nil {
			return err
		}
		var drop []string
		for _, l := range levels {
			if Tracked(g, l.OptionID) {
				continue
			}
			if l.OnHand > 0 || l.Reserved > 0 {
				return kernel.Refuse("An option with stock on hand cannot be removed or untracked. Adjust its stock to zero first.")
			}
			drop = append(drop, l.ID)
		}
		if err := t.Put("modifiers", g.ID, g); err != nil {
			return err
		}
		return s.ModifierStock.DropModifierStock(t, drop)
	})
}

// RemoveModifierGroup is modifiers/remove.
func (s *Catalog) RemoveModifierGroup(ctx context.Context, m kernel.Meta, id string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		g, err := kernel.Get[domain.ModifierGroup](t, "modifiers", id, "modifier group")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, g.TenantID); err != nil {
			return err
		}
		levels, err := s.ModifierStock.GroupModifierStock(t, g.TenantID, g.ID)
		if err != nil {
			return err
		}
		drop := make([]string, 0, len(levels))
		for _, l := range levels {
			if l.OnHand > 0 || l.Reserved > 0 {
				return kernel.Refuse("This group still has options with stock on hand. Adjust their stock to zero first.")
			}
			drop = append(drop, l.ID)
		}
		if err := t.Del("modifiers", g.ID); err != nil {
			return err
		}
		return s.ModifierStock.DropModifierStock(t, drop)
	})
}

// SaveCollection is collections/save.
func (s *Catalog) SaveCollection(ctx context.Context, m kernel.Meta, c domain.Collection) (*kernel.Delta, error) {
	if err := kernel.Access(m, c.TenantID); err != nil {
		return nil, err
	}
	return s.Run(ctx, func(t *kernel.Tx) error { return t.Put("collections", c.ID, c) })
}

// RemoveCollection is collections/remove.
func (s *Catalog) RemoveCollection(ctx context.Context, m kernel.Meta, id string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		c, err := kernel.Get[domain.Collection](t, "collections", id, "collection")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, c.TenantID); err != nil {
			return err
		}
		return t.Del("collections", c.ID)
	})
}

// SavePaymentType is paymentTypes/save.
func (s *Catalog) SavePaymentType(ctx context.Context, m kernel.Meta, p domain.PaymentType) (*kernel.Delta, error) {
	if err := kernel.Access(m, p.TenantID); err != nil {
		return nil, err
	}
	return s.Run(ctx, func(t *kernel.Tx) error { return t.Put("paymentTypes", p.ID, p) })
}

// TogglePaymentType is paymentTypes/toggle: the last enabled type stays on.
func (s *Catalog) TogglePaymentType(ctx context.Context, m kernel.Meta, id string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		p, err := kernel.Lock[domain.PaymentType](t, "paymentTypes", id, "payment type")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, p.TenantID); err != nil {
			return err
		}
		if p.Enabled {
			all, err := kernel.TenantRows[domain.PaymentType](t, "paymentTypes", p.TenantID)
			if err != nil {
				return err
			}
			if why := rules.PaymentTypeDisableBlocker(p, all); why != "" {
				return kernel.Refuse(why)
			}
		}
		p.Enabled = !p.Enabled
		return t.Put("paymentTypes", p.ID, p)
	})
}

// SaveAgentPolicy is agentPolicy/save: one policy per tenant.
func (s *Catalog) SaveAgentPolicy(ctx context.Context, m kernel.Meta, p domain.AgentPolicy) (*kernel.Delta, error) {
	if err := kernel.Access(m, p.TenantID); err != nil {
		return nil, err
	}
	if p.PaymentTypeIDs == nil {
		p.PaymentTypeIDs = []string{}
	}
	if p.Kinds == nil {
		p.Kinds = []string{}
	}
	return s.Run(ctx, func(t *kernel.Tx) error { return t.Put("agentPolicies", p.TenantID, p) })
}

func without(list []string, id string) []string {
	out := make([]string, 0, len(list))
	for _, x := range list {
		if x != id {
			out = append(out, x)
		}
	}
	return out
}
