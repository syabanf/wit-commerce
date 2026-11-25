package service

import (
	"errors"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// priceBooks answers the orders module's question for pricing a shopper's order: the marketing
// module's promotions and the catalog's categories and agent policy, read in the order's transaction.
type priceBooks struct{}

func (priceBooks) PriceBook(t *kernel.Tx, tenantID string) (rules.PriceBook, error) {
	promotions, err := store.ListTenant[domain.Promotion](t.Ctx, t.Tx, "promotions", tenantID)
	if err != nil {
		return rules.PriceBook{}, err
	}
	categories, err := store.ListTenant[domain.Category](t.Ctx, t.Tx, "categories", tenantID)
	if err != nil {
		return rules.PriceBook{}, err
	}
	book := rules.PriceBook{Promotions: promotions, Categories: categories}
	policy, err := store.Get[domain.AgentPolicy](t.Ctx, t.Tx, "agentPolicies", tenantID)
	switch {
	case err == nil:
		book.AgentPolicy = &policy
	case !errors.Is(err, store.ErrNotFound):
		return rules.PriceBook{}, err
	}
	return book, nil
}
