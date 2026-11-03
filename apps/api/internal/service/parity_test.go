package service_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/seed"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/testdb"
)

// The golden file records what the TypeScript reducer wrote for a scripted run through every action
// (scripts/api-golden.ts). The Go service must write the same rows, in the same order, for the same
// inputs. Generated ids differ by construction, so they compare as placeholders.

type goldenCase struct {
	Name    string                       `json:"name"`
	Action  json.RawMessage              `json:"action"`
	By      string                       `json:"by"`
	At      string                       `json:"at"`
	Upserts map[string][]json.RawMessage `json:"upserts"`
	Removes map[string][]string          `json:"removes"`
}

var generatedID = regexp.MustCompile(`^(ev|oev|mv|mmv|stk|mstk|rev)-[a-z0-9]{10}$`)

// normalize parses JSON and replaces generated ids with a placeholder, so two rows that differ only
// in the ids the two sides minted compare equal.
func normalize(raw []byte) any {
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		panic(err)
	}
	return scrub(v)
}

func scrub(v any) any {
	switch x := v.(type) {
	case map[string]any:
		for k, val := range x {
			if s, ok := val.(string); ok && generatedID.MatchString(s) {
				x[k] = "<generated>"
				continue
			}
			x[k] = scrub(val)
		}
		return x
	case []any:
		for i := range x {
			x[i] = scrub(x[i])
		}
		return x
	}
	return v
}

func sortedRows(rows []any) []string {
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		b, _ := json.Marshal(r)
		out = append(out, string(b))
	}
	sort.Strings(out)
	return out
}

func principal(by string) auth.Principal {
	switch by {
	case "system":
		return auth.System
	case "storefront":
		return auth.Principal{Kind: auth.KindCustomer, ID: "guest", TenantID: "ten-lari"}
	}
	return auth.Principal{Kind: auth.KindUser, ID: by, Role: "platform_admin"}
}

func TestServiceMatchesTheReducer(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	if err := seed.Load(ctx, db, testdb.SeedDir(t), ""); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join("..", "..", "testdata", "golden.json"))
	if err != nil {
		t.Fatalf("run pnpm gen:golden first: %v", err)
	}
	var golden struct {
		Cases []goldenCase `json:"cases"`
	}
	if err := json.Unmarshal(raw, &golden); err != nil {
		t.Fatal(err)
	}
	svc := &service.Service{DB: db, Clock: clock.New(clock.MustParse(clock.FixtureNow))}

	for _, c := range golden.Cases {
		t.Run(c.Name, func(t *testing.T) {
			delta, err := dispatch(ctx, svc, service.Meta{P: principal(c.By), At: c.At}, c.Action)
			expectsChange := len(c.Upserts) > 0 || len(c.Removes) > 0
			if !expectsChange {
				if err == nil && delta != nil && !delta.Empty() {
					t.Fatalf("reducer refused, service changed: %v", delta.Collections())
				}
				return
			}
			if err != nil {
				t.Fatalf("reducer changed state, service refused: %v", err)
			}
			got := map[string][]any{}
			for collection, rows := range delta.Upserts {
				for _, row := range rows {
					b, _ := json.Marshal(row)
					got[collection] = append(got[collection], normalize(b))
				}
			}
			want := map[string][]any{}
			for collection, rows := range c.Upserts {
				for _, row := range rows {
					want[collection] = append(want[collection], normalize(row))
				}
			}
			for _, collection := range union(want, got) {
				w, g := sortedRows(want[collection]), sortedRows(got[collection])
				if !reflect.DeepEqual(w, g) {
					t.Errorf("%s differs\n want (%d): %s\n  got (%d): %s", collection, len(w), strings.Join(w, "\n           "), len(g), strings.Join(g, "\n           "))
				}
			}
			gotRemoves := map[string][]string{}
			for collection, ids := range delta.Removes {
				sort.Strings(ids)
				gotRemoves[collection] = ids
			}
			wantRemoves := map[string][]string{}
			for collection, ids := range c.Removes {
				sort.Strings(ids)
				wantRemoves[collection] = ids
			}
			if !reflect.DeepEqual(wantRemoves, gotRemoves) {
				t.Errorf("removes differ\n want: %v\n  got: %v", wantRemoves, gotRemoves)
			}
		})
	}
}

func union(a, b map[string][]any) []string {
	seen := map[string]bool{}
	var out []string
	for k := range a {
		seen[k] = true
	}
	for k := range b {
		seen[k] = true
	}
	for k := range seen {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// dispatch routes a reducer action to the service method the HTTP layer would call.
func dispatch(ctx context.Context, s *service.Service, m service.Meta, raw json.RawMessage) (*service.Delta, error) {
	var head struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(raw, &head); err != nil {
		return nil, err
	}
	parse := func(v any) {
		if err := json.Unmarshal(raw, v); err != nil {
			panic(err)
		}
	}
	switch head.Type {
	case "tenants/create":
		var a struct{ Tenant domain.Tenant }
		parse(&a)
		return s.CreateTenant(ctx, m, a.Tenant)
	case "tenants/completeStep":
		var a struct{ TenantID, Step string }
		parse(&a)
		return s.CompleteOnboardingStep(ctx, m, a.TenantID, a.Step)
	case "brand/update":
		var a struct {
			TenantID string
			Brand    domain.BrandConfig
		}
		parse(&a)
		return s.UpdateBrand(ctx, m, a.TenantID, a.Brand)
	case "brand/toggleLock":
		var a struct{ TenantID, Key string }
		parse(&a)
		return s.ToggleBrandLock(ctx, m, a.TenantID, a.Key)
	case "products/save":
		var a struct{ Product domain.Product }
		parse(&a)
		return s.SaveProduct(ctx, m, a.Product)
	case "products/setAttributes":
		var a struct {
			ID         string
			Attributes map[string]string
		}
		parse(&a)
		return s.SetProductAttributes(ctx, m, a.ID, a.Attributes)
	case "products/setStatus":
		var a struct{ ID, Status string }
		parse(&a)
		return s.SetProductStatus(ctx, m, a.ID, a.Status)
	case "categories/save":
		var a struct{ Category domain.Category }
		parse(&a)
		return s.SaveCategory(ctx, m, a.Category)
	case "categories/remove":
		var a struct{ ID string }
		parse(&a)
		return s.RemoveCategory(ctx, m, a.ID)
	case "attributes/save":
		var a struct{ Attribute domain.AttributeDef }
		parse(&a)
		return s.SaveAttribute(ctx, m, a.Attribute)
	case "attributes/remove":
		var a struct{ ID string }
		parse(&a)
		return s.RemoveAttribute(ctx, m, a.ID)
	case "modifiers/save":
		var a struct{ Group domain.ModifierGroup }
		parse(&a)
		return s.SaveModifierGroup(ctx, m, a.Group)
	case "modifiers/remove":
		var a struct{ ID string }
		parse(&a)
		return s.RemoveModifierGroup(ctx, m, a.ID)
	case "collections/save":
		var a struct{ Collection domain.Collection }
		parse(&a)
		return s.SaveCollection(ctx, m, a.Collection)
	case "collections/remove":
		var a struct{ ID string }
		parse(&a)
		return s.RemoveCollection(ctx, m, a.ID)
	case "paymentTypes/save":
		var a struct{ PaymentType domain.PaymentType }
		parse(&a)
		return s.SavePaymentType(ctx, m, a.PaymentType)
	case "paymentTypes/toggle":
		var a struct{ ID string }
		parse(&a)
		return s.TogglePaymentType(ctx, m, a.ID)
	case "agentPolicy/save":
		var a struct{ Policy domain.AgentPolicy }
		parse(&a)
		return s.SaveAgentPolicy(ctx, m, a.Policy)
	case "stock/adjust":
		var a struct {
			LevelID string
			Delta   int
			Note    string
		}
		parse(&a)
		return s.AdjustStock(ctx, m, a.LevelID, a.Delta, a.Note)
	case "modifierStock/adjust":
		var a struct {
			LevelID string
			Delta   int
			Note    string
		}
		parse(&a)
		return s.AdjustModifierStock(ctx, m, a.LevelID, a.Delta, a.Note)
	case "stock/receive":
		var a service.ReceiveInput
		parse(&a)
		return s.ReceiveStock(ctx, m, a)
	case "modifierStock/receive":
		var a service.ReceiveInput
		parse(&a)
		return s.ReceiveModifierStock(ctx, m, a)
	case "orders/place":
		var a struct {
			Order    domain.Order
			Customer *domain.Customer
		}
		parse(&a)
		return s.PlaceOrder(ctx, m, a.Order, a.Customer)
	case "orders/advance":
		var a struct {
			ID         string
			TrackingNo *string
		}
		parse(&a)
		return s.AdvanceOrder(ctx, m, a.ID, a.TrackingNo)
	case "orders/cancel":
		var a struct{ ID, Reason, Note string }
		parse(&a)
		return s.CancelOrder(ctx, m, a.ID, a.Reason, a.Note)
	case "orders/refund":
		var a struct {
			ID     string
			Amount int
			Note   string
		}
		parse(&a)
		return s.RefundOrder(ctx, m, a.ID, a.Amount, a.Note)
	case "orders/note":
		var a struct{ ID, Note string }
		parse(&a)
		return s.NoteOrder(ctx, m, a.ID, a.Note)
	case "customers/save":
		var a struct{ Customer domain.Customer }
		parse(&a)
		return s.SaveCustomer(ctx, m, a.Customer)
	case "customers/note":
		var a struct{ ID, Note string }
		parse(&a)
		return s.NoteCustomer(ctx, m, a.ID, a.Note)
	case "customers/addPoints":
		var a struct {
			ID     string
			Points int
			Reason string
		}
		parse(&a)
		return s.AddPoints(ctx, m, a.ID, a.Points, a.Reason)
	case "segments/save":
		var a struct{ Segment domain.Segment }
		parse(&a)
		return s.SaveSegment(ctx, m, a.Segment)
	case "segments/remove":
		var a struct{ ID string }
		parse(&a)
		return s.RemoveSegment(ctx, m, a.ID)
	case "leads/save":
		var a struct{ Lead domain.Lead }
		parse(&a)
		return s.SaveLead(ctx, m, a.Lead)
	case "leads/move":
		var a struct {
			ID, Stage  string
			LostReason *string
		}
		parse(&a)
		return s.MoveLead(ctx, m, a.ID, a.Stage, a.LostReason)
	case "tickets/assign":
		var a struct {
			ID         string
			AssigneeID *string
		}
		parse(&a)
		return s.AssignTicket(ctx, m, a.ID, a.AssigneeID)
	case "tickets/resolve":
		var a struct{ ID string }
		parse(&a)
		return s.ResolveTicket(ctx, m, a.ID)
	case "campaigns/save":
		var a struct{ Campaign domain.Campaign }
		parse(&a)
		return s.SaveCampaign(ctx, m, a.Campaign)
	case "campaigns/launch":
		var a struct{ ID string }
		parse(&a)
		return s.LaunchCampaign(ctx, m, a.ID)
	case "campaigns/pause":
		var a struct{ ID string }
		parse(&a)
		return s.PauseCampaign(ctx, m, a.ID)
	case "automations/save":
		var a struct{ Automation domain.Automation }
		parse(&a)
		return s.SaveAutomation(ctx, m, a.Automation)
	case "automations/setStatus":
		var a struct{ ID, Status string }
		parse(&a)
		return s.SetAutomationStatus(ctx, m, a.ID, a.Status)
	case "promotions/save":
		var a struct{ Promotion domain.Promotion }
		parse(&a)
		return s.SavePromotion(ctx, m, a.Promotion)
	case "promotions/setStatus":
		var a struct{ ID, Status string }
		parse(&a)
		return s.SetPromotionStatus(ctx, m, a.ID, a.Status)
	case "pages/create":
		var a struct{ Page domain.Page }
		parse(&a)
		return s.CreatePage(ctx, m, a.Page)
	case "pages/save":
		var a struct {
			ID string
			service.SavePageInput
		}
		parse(&a)
		return s.SavePage(ctx, m, a.ID, a.SavePageInput)
	case "pages/setTemplate":
		var a struct{ ID, TemplateID string }
		parse(&a)
		return s.SetPageTemplate(ctx, m, a.ID, a.TemplateID)
	case "pages/publish":
		var a struct{ ID string }
		parse(&a)
		return s.PublishPage(ctx, m, a.ID)
	case "pages/schedule":
		var a struct{ ID, At string }
		parse(&a)
		return s.SchedulePage(ctx, m, a.ID, a.At)
	case "pages/unpublish":
		var a struct{ ID string }
		parse(&a)
		return s.UnpublishPage(ctx, m, a.ID)
	case "pages/rollback":
		var a struct{ ID, RevisionID string }
		parse(&a)
		return s.RollbackPage(ctx, m, a.ID, a.RevisionID)
	case "sellers/save":
		var a struct{ Seller domain.Seller }
		parse(&a)
		return s.SaveSeller(ctx, m, a.Seller)
	case "sellers/setTemplate":
		var a struct{ ID, TemplateID string }
		parse(&a)
		return s.SetSellerTemplate(ctx, m, a.ID, a.TemplateID)
	case "sellers/setStatus":
		var a struct{ ID, Status string }
		parse(&a)
		return s.SetSellerStatus(ctx, m, a.ID, a.Status)
	case "integrations/toggle":
		var a struct{ ID string }
		parse(&a)
		return s.ToggleIntegration(ctx, m, a.ID)
	case "integrations/sync":
		var a struct{ ID string }
		parse(&a)
		return s.SyncIntegration(ctx, m, a.ID)
	case "system/tick":
		return s.Tick(ctx, m.At)
	}
	return nil, fmt.Errorf("no service method for %s", head.Type)
}
