package service

import (
	"context"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
)

// SaveProduct is products/save.
func (s *Service) SaveProduct(ctx context.Context, m Meta, p domain.Product) (*Delta, error) {
	if err := access(m, p.TenantID); err != nil {
		return nil, err
	}
	return s.run(ctx, func(t *tx) error { return t.put("products", p.ID, p) })
}

// SetProductAttributes is products/setAttributes.
func (s *Service) SetProductAttributes(ctx context.Context, m Meta, id string, attributes map[string]string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		p, err := lock[domain.Product](t, "products", id, "product")
		if err != nil {
			return err
		}
		if err := access(m, p.TenantID); err != nil {
			return err
		}
		if attributes == nil {
			attributes = map[string]string{}
		}
		p.Attributes = attributes
		return t.put("products", p.ID, p)
	})
}

// SetProductStatus is products/setStatus.
func (s *Service) SetProductStatus(ctx context.Context, m Meta, id, status string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		p, err := lock[domain.Product](t, "products", id, "product")
		if err != nil {
			return err
		}
		if err := access(m, p.TenantID); err != nil {
			return err
		}
		if status == "active" {
			defs, err := tenantRows[domain.AttributeDef](t, "attributes", p.TenantID)
			if err != nil {
				return err
			}
			categories, err := tenantRows[domain.Category](t, "categories", p.TenantID)
			if err != nil {
				return err
			}
			if why := rules.ProductActivateBlocker(p, rules.AttributesFor(p.CategoryID, defs, categories)); why != "" {
				return refuse(why)
			}
		}
		p.Status = status
		return t.put("products", p.ID, p)
	})
}

// SaveCategory is categories/save.
func (s *Service) SaveCategory(ctx context.Context, m Meta, c domain.Category) (*Delta, error) {
	if err := access(m, c.TenantID); err != nil {
		return nil, err
	}
	return s.run(ctx, func(t *tx) error { return t.put("categories", c.ID, c) })
}

// RemoveCategory is categories/remove: attributes scoped to it drop the reference.
func (s *Service) RemoveCategory(ctx context.Context, m Meta, id string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		c, err := get[domain.Category](t, "categories", id, "category")
		if err != nil {
			return err
		}
		if err := access(m, c.TenantID); err != nil {
			return err
		}
		products, err := tenantRows[domain.Product](t, "products", c.TenantID)
		if err != nil {
			return err
		}
		categories, err := tenantRows[domain.Category](t, "categories", c.TenantID)
		if err != nil {
			return err
		}
		if why := rules.CategoryRemoveBlocker(c, products, categories); why != "" {
			return refuse(why)
		}
		if err := t.del("categories", c.ID); err != nil {
			return err
		}
		defs, err := tenantRows[domain.AttributeDef](t, "attributes", c.TenantID)
		if err != nil {
			return err
		}
		for _, d := range defs {
			kept := without(d.CategoryIDs, c.ID)
			if len(kept) == len(d.CategoryIDs) {
				continue
			}
			d.CategoryIDs = kept
			if err := t.put("attributes", d.ID, d); err != nil {
				return err
			}
		}
		return nil
	})
}

// SaveAttribute is attributes/save.
func (s *Service) SaveAttribute(ctx context.Context, m Meta, a domain.AttributeDef) (*Delta, error) {
	if err := access(m, a.TenantID); err != nil {
		return nil, err
	}
	return s.run(ctx, func(t *tx) error { return t.put("attributes", a.ID, a) })
}

// RemoveAttribute is attributes/remove: products drop their value for it.
func (s *Service) RemoveAttribute(ctx context.Context, m Meta, id string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		a, err := get[domain.AttributeDef](t, "attributes", id, "attribute")
		if err != nil {
			return err
		}
		if err := access(m, a.TenantID); err != nil {
			return err
		}
		if err := t.del("attributes", a.ID); err != nil {
			return err
		}
		products, err := tenantRows[domain.Product](t, "products", a.TenantID)
		if err != nil {
			return err
		}
		for _, p := range products {
			if _, has := p.Attributes[a.ID]; !has {
				continue
			}
			delete(p.Attributes, a.ID)
			if err := t.put("products", p.ID, p); err != nil {
				return err
			}
		}
		return nil
	})
}

func tracked(g domain.ModifierGroup, optionID string) bool {
	for _, o := range g.Options {
		if o.ID == optionID && o.Tracked() {
			return true
		}
	}
	return false
}

// SaveModifierGroup is modifiers/save: options with stock on hand cannot be dropped or untracked.
func (s *Service) SaveModifierGroup(ctx context.Context, m Meta, g domain.ModifierGroup) (*Delta, error) {
	if err := access(m, g.TenantID); err != nil {
		return nil, err
	}
	return s.run(ctx, func(t *tx) error {
		levels, err := tenantRows[domain.ModifierStockLevel](t, "modifierStock", g.TenantID)
		if err != nil {
			return err
		}
		for _, l := range levels {
			if l.GroupID == g.ID && (l.OnHand > 0 || l.Reserved > 0) && !tracked(g, l.OptionID) {
				return refuse("An option with stock on hand cannot be removed or untracked. Adjust its stock to zero first.")
			}
		}
		if err := t.put("modifiers", g.ID, g); err != nil {
			return err
		}
		for _, l := range levels {
			if l.GroupID == g.ID && !tracked(g, l.OptionID) {
				if err := t.del("modifierStock", l.ID); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

// RemoveModifierGroup is modifiers/remove.
func (s *Service) RemoveModifierGroup(ctx context.Context, m Meta, id string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		g, err := get[domain.ModifierGroup](t, "modifiers", id, "modifier group")
		if err != nil {
			return err
		}
		if err := access(m, g.TenantID); err != nil {
			return err
		}
		levels, err := tenantRows[domain.ModifierStockLevel](t, "modifierStock", g.TenantID)
		if err != nil {
			return err
		}
		for _, l := range levels {
			if l.GroupID == g.ID && (l.OnHand > 0 || l.Reserved > 0) {
				return refuse("This group still has options with stock on hand. Adjust their stock to zero first.")
			}
		}
		if err := t.del("modifiers", g.ID); err != nil {
			return err
		}
		for _, l := range levels {
			if l.GroupID == g.ID {
				if err := t.del("modifierStock", l.ID); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

// SaveCollection is collections/save.
func (s *Service) SaveCollection(ctx context.Context, m Meta, c domain.Collection) (*Delta, error) {
	if err := access(m, c.TenantID); err != nil {
		return nil, err
	}
	return s.run(ctx, func(t *tx) error { return t.put("collections", c.ID, c) })
}

// RemoveCollection is collections/remove.
func (s *Service) RemoveCollection(ctx context.Context, m Meta, id string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		c, err := get[domain.Collection](t, "collections", id, "collection")
		if err != nil {
			return err
		}
		if err := access(m, c.TenantID); err != nil {
			return err
		}
		return t.del("collections", c.ID)
	})
}

// SavePaymentType is paymentTypes/save.
func (s *Service) SavePaymentType(ctx context.Context, m Meta, p domain.PaymentType) (*Delta, error) {
	if err := access(m, p.TenantID); err != nil {
		return nil, err
	}
	return s.run(ctx, func(t *tx) error { return t.put("paymentTypes", p.ID, p) })
}

// TogglePaymentType is paymentTypes/toggle: the last enabled type stays on.
func (s *Service) TogglePaymentType(ctx context.Context, m Meta, id string) (*Delta, error) {
	return s.run(ctx, func(t *tx) error {
		p, err := lock[domain.PaymentType](t, "paymentTypes", id, "payment type")
		if err != nil {
			return err
		}
		if err := access(m, p.TenantID); err != nil {
			return err
		}
		if p.Enabled {
			all, err := tenantRows[domain.PaymentType](t, "paymentTypes", p.TenantID)
			if err != nil {
				return err
			}
			if why := rules.PaymentTypeDisableBlocker(p, all); why != "" {
				return refuse(why)
			}
		}
		p.Enabled = !p.Enabled
		return t.put("paymentTypes", p.ID, p)
	})
}

// SaveAgentPolicy is agentPolicy/save: one policy per tenant.
func (s *Service) SaveAgentPolicy(ctx context.Context, m Meta, p domain.AgentPolicy) (*Delta, error) {
	if err := access(m, p.TenantID); err != nil {
		return nil, err
	}
	if p.PaymentTypeIDs == nil {
		p.PaymentTypeIDs = []string{}
	}
	if p.Kinds == nil {
		p.Kinds = []string{}
	}
	return s.run(ctx, func(t *tx) error { return t.put("agentPolicies", p.TenantID, p) })
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
