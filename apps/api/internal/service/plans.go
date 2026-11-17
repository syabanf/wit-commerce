package service

import (
	"context"
	"errors"
	"slices"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/antispam"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/billing"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/identity"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/inventory"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Plan limits live in the facade because each one counts rows another module owns, and the plan
// itself sits on the tenant. The wrappers below shadow the module actions of the same name, so
// every caller, HTTP route or not, passes the check. Only a new row is checked: a brand already
// over a limit keeps editing what it has.

// PlanUsage is how much of each limit a brand uses now, keyed like billing.Limits.
type PlanUsage map[string]int64

// tenantPlan reads a tenant and its plan as it applies now. ok is false for a tenant that does not
// exist, which the action itself then reports.
func (s *Service) tenantPlan(ctx context.Context, tenantID string) (domain.Tenant, billing.Plan, bool, error) {
	tenant, err := store.Get[domain.Tenant](ctx, s.DB.Pool, "tenants", tenantID)
	if errors.Is(err, store.ErrNotFound) {
		return tenant, billing.Plan{}, false, nil
	}
	if err != nil {
		return tenant, billing.Plan{}, false, err
	}
	plan, err := billing.PlanOf(ctx, s.DB.Pool, tenant.Plan)
	return tenant, plan, err == nil, err
}

// countQueries count a brand's rows per limit. Staff are the enabled people who work in the brand;
// platform admins reach every brand and take no seat.
var countQueries = map[string]string{
	billing.Products:   `select count(*) from products where tenant_id = $1`,
	billing.Sellers:    `select count(*) from sellers where tenant_id = $1`,
	billing.Warehouses: `select count(*) from warehouses where tenant_id = $1`,
	billing.Staff: `select count(*) from users where data->'tenantIds' ? $1 and data->>'role' <> 'platform_admin'
		and coalesce((data->>'disabled')::boolean, false) = false`,
}

func (s *Service) count(ctx context.Context, key, tenantID string) (int64, error) {
	var n int64
	err := s.DB.Pool.QueryRow(ctx, countQueries[key], tenantID).Scan(&n)
	return n, err
}

// roomFor refuses a new row of a counted kind once the brand's plan is full. exists names the table
// to look the id up in: a row that is already there is an edit and always passes.
func (s *Service) roomFor(ctx context.Context, tenantID, key, table, id string) error {
	if table != "" && id != "" {
		var exists bool
		if err := s.DB.Pool.QueryRow(ctx, `select exists (select 1 from `+table+` where id = $1)`, id).Scan(&exists); err != nil || exists {
			return err
		}
	}
	_, plan, ok, err := s.tenantPlan(ctx, tenantID)
	if err != nil || !ok {
		return err
	}
	used, err := s.count(ctx, key, tenantID)
	if err != nil {
		return err
	}
	if used >= int64(plan.Limits.Of(key)) {
		return billing.LimitReached(plan, key)
	}
	return nil
}

// SaveProduct is products/save, refused for a new product past the plan's limit.
func (s *Service) SaveProduct(ctx context.Context, m Meta, p domain.Product) (*Delta, error) {
	if err := s.roomFor(ctx, p.TenantID, billing.Products, "products", p.ID); err != nil {
		return nil, err
	}
	return s.Catalog.SaveProduct(ctx, m, p)
}

// SaveSeller is sellers/save, refused for a new seller past the plan's limit.
func (s *Service) SaveSeller(ctx context.Context, m Meta, seller domain.Seller) (*Delta, error) {
	if err := s.roomFor(ctx, seller.TenantID, billing.Sellers, "sellers", seller.ID); err != nil {
		return nil, err
	}
	return s.Storefront.SaveSeller(ctx, m, seller)
}

// CreateWarehouse adds a warehouse, refused past the plan's limit.
func (s *Service) CreateWarehouse(ctx context.Context, m Meta, in inventory.WarehouseInput) (*Delta, error) {
	if err := s.roomFor(ctx, in.TenantID, billing.Warehouses, "", ""); err != nil {
		return nil, err
	}
	return s.Inventory.CreateWarehouse(ctx, m, in)
}

// SetDisplayCurrencies is tenants/setDisplayCurrencies, refused when the choice is longer than the
// plan allows. A brand already over the limit may still shorten its list.
func (s *Service) SetDisplayCurrencies(ctx context.Context, m Meta, tenantID string, currencies []string) (*Delta, error) {
	tenant, plan, ok, err := s.tenantPlan(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	var chosen []string
	for _, code := range currencies {
		if !slices.Contains(chosen, code) {
			chosen = append(chosen, code)
		}
	}
	if ok && len(chosen) > plan.Limits.Currencies && len(chosen) > len(tenant.DisplayCurrencies) {
		return nil, billing.LimitReached(plan, billing.Currencies)
	}
	return s.Identity.SetDisplayCurrencies(ctx, m, tenantID, currencies)
}

// StaffRoom refuses a new staff seat in any of the brands whose plan is full.
func (s *Service) StaffRoom(ctx context.Context, tenantIDs []string) error {
	for _, id := range tenantIDs {
		if err := s.roomFor(ctx, id, billing.Staff, "", ""); err != nil {
			return err
		}
	}
	return nil
}

// MediaRoom refuses an upload that would take the brand past its plan's storage.
func (s *Service) MediaRoom(ctx context.Context, tenantID string, usedBytes, addBytes int64) error {
	_, plan, ok, err := s.tenantPlan(ctx, tenantID)
	if err != nil || !ok {
		return err
	}
	if usedBytes+addBytes > int64(plan.Limits.MediaMB)<<20 {
		return billing.LimitReached(plan, billing.MediaMB)
	}
	return nil
}

// AssistantDailyLimit is how many assistant questions the brand's plan allows a day.
func (s *Service) AssistantDailyLimit(ctx context.Context, tenantID string) (int, error) {
	_, plan, _, err := s.tenantPlan(ctx, tenantID)
	return plan.Limits.AssistantPerDay, err
}

// PlanOverview is what Plan & usage shows a brand.
type PlanOverview struct {
	TenantID string `json:"tenantId"`
	Plan     string `json:"plan"`
	// Plans is the catalog as it applies now, smallest first.
	Plans    []billing.Plan        `json:"plans"`
	Usage    PlanUsage             `json:"usage"`
	Requests []billing.PlanRequest `json:"requests"`
	Invoices []billing.Invoice     `json:"invoices"`
}

// Overview gathers a brand's plan, usage, requests and invoices. mediaBytes comes from the media
// module, which the HTTP layer holds.
func (s *Service) Overview(ctx context.Context, m Meta, tenantID string, mediaBytes int64) (PlanOverview, error) {
	out := PlanOverview{TenantID: tenantID, Usage: PlanUsage{}}
	if err := kernel.Access(m, tenantID); err != nil {
		return out, err
	}
	tenant, err := store.Get[domain.Tenant](ctx, s.DB.Pool, "tenants", tenantID)
	if errors.Is(err, store.ErrNotFound) {
		return out, kernel.NotFound{What: "tenant"}
	}
	if err != nil {
		return out, err
	}
	out.Plan = tenant.Plan
	if !billing.Valid(out.Plan) {
		out.Plan = billing.IDs[0]
	}
	if out.Plans, err = billing.Catalog(ctx, s.DB.Pool); err != nil {
		return out, err
	}
	for key := range countQueries {
		if out.Usage[key], err = s.count(ctx, key, tenantID); err != nil {
			return out, err
		}
	}
	out.Usage[billing.Currencies] = int64(len(tenant.DisplayCurrencies))
	// Storage shows in whole megabytes, rounded up so a first small file reads as 1 and not 0.
	out.Usage[billing.MediaMB] = (mediaBytes + 1<<20 - 1) >> 20
	asked, err := antispam.Count(ctx, s.DB.Pool, antispam.AssistantDaily, tenantID, 24*time.Hour, time.Now())
	if err != nil {
		return out, err
	}
	out.Usage[billing.AssistantPerDay] = int64(asked)
	if out.Requests, err = billing.Requests(ctx, s.DB.Pool, tenantID); err != nil {
		return out, err
	}
	out.Invoices, err = billing.Invoices(ctx, s.DB.Pool, tenantID)
	return out, err
}

// RequestPlan records a brand's request for another plan.
func (s *Service) RequestPlan(ctx context.Context, m Meta, tenantID, plan, note string) (billing.PlanRequest, error) {
	if err := kernel.Access(m, tenantID); err != nil {
		return billing.PlanRequest{}, err
	}
	tenant, err := store.Get[domain.Tenant](ctx, s.DB.Pool, "tenants", tenantID)
	if errors.Is(err, store.ErrNotFound) {
		return billing.PlanRequest{}, kernel.NotFound{What: "tenant"}
	}
	if err != nil {
		return billing.PlanRequest{}, err
	}
	return s.Billing.Ask(ctx, m, tenantID, tenant.Plan, plan, note)
}

// DecidePlanRequest answers a waiting request. Approval moves the tenant to the requested plan in
// the same transaction, so the two cannot disagree.
func (s *Service) DecidePlanRequest(ctx context.Context, m Meta, id string, approve bool, note string) (*Delta, billing.PlanRequest, error) {
	var decided billing.PlanRequest
	d, err := s.Run(ctx, func(t *kernel.Tx) error {
		var err error
		if decided, err = billing.Decide(t, m, id, approve, note); err != nil || !approve {
			return err
		}
		return identity.SetPlan(t, decided.TenantID, decided.ToPlan)
	})
	return d, decided, err
}

// SetTenantPlan moves a tenant to a plan without a request, for a platform admin.
func (s *Service) SetTenantPlan(ctx context.Context, tenantID, plan string) (*Delta, error) {
	if !billing.Valid(plan) {
		return nil, kernel.Invalid{Reason: "Choose one of the plans."}
	}
	return s.Run(ctx, func(t *kernel.Tx) error { return identity.SetPlan(t, tenantID, plan) })
}

// IssueInvoices writes this month's invoice for every tenant on a plan with a price, once. The tick
// calls it; a tenant that already has the month's invoice is skipped.
func (s *Service) IssueInvoices(ctx context.Context, at string) (int, error) {
	plans, err := billing.Catalog(ctx, s.DB.Pool)
	if err != nil {
		return 0, err
	}
	tenants, err := store.List[domain.Tenant](ctx, s.DB.Pool, "tenants", "")
	if err != nil {
		return 0, err
	}
	issued := 0
	for _, tenant := range tenants {
		i := slices.Index(billing.IDs, tenant.Plan)
		if i < 0 || plans[i].Price == 0 {
			continue
		}
		wrote, err := billing.Issue(ctx, s.DB.Pool, tenant.ID, plans[i], at)
		if err != nil {
			return issued, err
		}
		if wrote {
			issued++
		}
	}
	return issued, nil
}
