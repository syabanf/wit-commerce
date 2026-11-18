package httpapi

import (
	"context"
	"fmt"
	"slices"
	"strings"

	aimodule "github.com/syabanf/wit-commerce/apps/api/internal/modules/ai"
)

// The lookups the assistant's model may ask for. Each reads at most aimodule.LookupRows rows of
// one tenant, a sales user's only when the type has an own-records rule (the ai module closes the
// rest to them), and never an email, phone or address.

var (
	orderStatuses  = []string{"new", "confirmed", "paid", "processing", "packed", "shipped", "delivered", "completed", "cancelled", "returned", "refunded"}
	ticketStatuses = []string{"open", "pending", "resolved"}
	leadStages     = []string{"new", "qualified", "proposal", "negotiation", "won", "lost"}
)

// like is a contains pattern; the ai module's query check already refuses % and _.
func like(query string) string { return "%" + query + "%" }

// assistantLookup returns the lookup runner for one question.
func (s *Server) assistantLookup(tenantID, userID string, sellers []string) aimodule.Lookup {
	return func(ctx context.Context, req aimodule.LookupRequest) (aimodule.LookupResult, error) {
		res, err := s.runLookup(ctx, tenantID, userID, sellers, req)
		if err == nil && emptyLookup(res) {
			res.Note = "Nothing matched."
		}
		return res, err
	}
}

func (s *Server) runLookup(ctx context.Context, tenantID, userID string, sellers []string, req aimodule.LookupRequest) (aimodule.LookupResult, error) {
	var res aimodule.LookupResult
	var err error
	q, lower, upper := req.Query, strings.ToLower(req.Query), strings.ToUpper(req.Query)
	n := aimodule.LookupRows
	args := []any{tenantID}
	// own adds a sales user's rule, with rule taking the parameter number.
	own := func(where, rule string) string {
		if sellers == nil {
			return where
		}
		args = append(args, sellers)
		return where + " and " + fmt.Sprintf(rule, len(args))
	}
	switch req.Type {
	case aimodule.LookupOrders:
		where := "tenant_id = $1 and "
		if slices.Contains(orderStatuses, lower) {
			args = append(args, lower)
			where += "status = $2"
		} else {
			args = append(args, upper)
			where += "(upper(code) = $2 or upper(customer_code) = $2)"
		}
		res.Orders, err = s.orderFacts(ctx, own(where, ownOrderRows), "created_at desc, id", n, args, true)
	case aimodule.LookupCustomers:
		args = append(args, upper, like(q))
		where := own("c.tenant_id = $1 and (upper(c.code) = $2 or c.data->>'name' ilike $3)", "c.seller_id = any($%d)")
		res.Customers, err = s.customerFacts(ctx, where, "coalesce(m.spend, 0) desc, c.id", n, args)
	case aimodule.LookupProducts:
		var rows []productRow
		rows, err = s.productFacts(ctx, tenantID, `(data->>'name' ilike $2 or upper(code) = $3 or exists (
			select 1 from jsonb_array_elements(data->'variants') v where upper(v->>'sku') = $3))`, []any{like(q), upper}, 5)
		for _, r := range rows {
			res.Products = append(res.Products, r.ProductFact)
		}
	case aimodule.LookupPromotions:
		res.Promotions, err = s.promotionFacts(ctx, tenantID, "(data->>'name' ilike $2 or code = $3)", []any{like(q), upper}, n)
	case aimodule.LookupCampaigns:
		res.Campaigns, err = s.campaignFacts(ctx, tenantID, "data->>'name' ilike $2", []any{like(q)}, n)
	case aimodule.LookupTickets:
		if slices.Contains(ticketStatuses, lower) {
			res.Tickets, err = s.ticketFacts(ctx, userID, "t.tenant_id = $1 and t.status = $2", []any{tenantID, lower}, n)
		}
	case aimodule.LookupLeads:
		where := "tenant_id = $1 and "
		if slices.Contains(leadStages, lower) {
			args = append(args, lower)
			where += "stage = $2"
		} else {
			args = append(args, upper)
			where += "upper(data->>'code') = $2"
		}
		res.Leads, err = s.leadFacts(ctx, own(where, "seller_id = any($%d)"), args, n)
	}
	return res, err
}

func emptyLookup(r aimodule.LookupResult) bool {
	return len(r.Orders)+len(r.Customers)+len(r.Products)+len(r.Promotions)+len(r.Campaigns)+len(r.Tickets)+len(r.Leads) == 0
}
