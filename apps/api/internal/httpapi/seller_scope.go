package httpapi

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/events"
	"github.com/syabanf/wit-commerce/apps/api/internal/readmodel"
)

// A sales user reads the orders of their own seller profiles and of the customers assigned to them,
// the same rule the seller app applies. Every other role and every API key reads the whole brand.

// ownSellers returns the seller profiles of a sales user, or nil when the reader is not limited.
// A sales user without a profile gets an empty list and so reads no orders.
func (s *Server) ownSellers(ctx context.Context, p auth.Principal) ([]string, error) {
	if p.Kind != auth.KindUser || p.Role != "sales" {
		return nil, nil
	}
	rows, err := s.DB.Pool.Query(ctx, `select id from sellers where data->>'userId' = $1 order by id`, p.ID)
	if err != nil {
		return nil, err
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if ids == nil {
		ids = []string{}
	}
	return ids, err
}

// ownCustomers matches customer_id against the customers assigned to the sellers in parameter $n.
const ownCustomers = `customer_id in (select id from customers where data->>'sellerId' = any($%[1]d))`

// ownOrders matches an orders or order_rows row sold by, or bought by a customer of, the sellers in $n.
const ownOrders = `(data->>'sellerId' = any($%[1]d) or ` + ownCustomers + `)`

// ownOrderRows is ownOrders for order_rows, which keeps the seller in a column.
const ownOrderRows = `(seller_id = any($%[1]d) or ` + ownCustomers + `)`

// sellerStream keeps a sales user's event stream to their own orders. It learns customer
// assignments from the customer rows that pass through, so a reassignment takes effect at once.
type sellerStream struct {
	sellers   map[string]bool
	customers map[string]bool
}

func (s *Server) sellerStreamScope(ctx context.Context, tenantIDs, sellers []string) (events.Scope, error) {
	rows, err := s.DB.Pool.Query(ctx, `select id from customers where data->>'sellerId' = any($1)`, sellers)
	if err != nil {
		return events.Scope{}, err
	}
	customers, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return events.Scope{}, err
	}
	st := sellerStream{sellers: map[string]bool{}, customers: map[string]bool{}}
	for _, id := range sellers {
		st.sellers[id] = true
	}
	for _, id := range customers {
		st.customers[id] = true
	}
	return events.Scope{TenantIDs: tenantIDs, Keep: st.keep}, nil
}

func (st sellerStream) keep(collection string, data json.RawMessage) bool {
	var row struct {
		ID         string `json:"id"`
		SellerID   string `json:"sellerId"`
		CustomerID string `json:"customerId"`
	}
	if json.Unmarshal(data, &row) != nil {
		return false
	}
	switch collection {
	case "customers":
		if st.sellers[row.SellerID] {
			st.customers[row.ID] = true
		} else {
			delete(st.customers, row.ID)
		}
		return true
	case "orders":
		return st.sellers[row.SellerID] || st.customers[row.CustomerID]
	case "customerEvents", readmodel.CustomerMetricsCollection:
		return st.customers[row.CustomerID]
	case readmodel.SalesDaysCollection, readmodel.SellerBuyersCollection:
		return st.sellers[row.SellerID]
	case readmodel.ProductDaysCollection:
		return false
	}
	return true
}

// limitState narrows the state collections that carry order figures to a sales user's own.
func limitState(collection string, sellers []string) (string, []any, bool) {
	switch collection {
	case "orders":
		return fmt.Sprintf(ownOrders, 2), []any{sellers}, true
	case readmodel.CustomerMetricsCollection:
		return fmt.Sprintf(ownCustomers, 2), []any{sellers}, true
	case readmodel.SalesDaysCollection, readmodel.SellerBuyersCollection:
		return "seller_id = any($2)", []any{sellers}, true
	case readmodel.ProductDaysCollection:
		return "false", nil, true
	}
	return "", nil, false
}
