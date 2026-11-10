package service

import (
	"context"
	"slices"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/identity"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
)

// SignUpInput is a new store and its owner, from the public sign-up page. The HTTP layer checks the
// email and password and passes the hash.
type SignUpInput struct {
	StoreName  string
	Subdomain  string
	Industry   string
	TemplateID string
	OwnerName  string
	Email      string
}

// industries mirrors INDUSTRY_LABEL.
var industries = []string{"sport", "beauty", "industrial", "fnb", "fashion", "electronics"}

// signUpTemplates are the store templates a new owner picks from.
var signUpTemplates = []string{"tpl-minimal", "tpl-editorial", "tpl-catalog"}

// signUpSteps are the onboarding steps sign-up covers: the business, its template and payment.
var signUpSteps = []string{"business", "template", "payment"}

// SignUp creates an owner and their store in one transaction: the tenant, a draft home page from the
// chosen template, a main warehouse and two manual payment types. The catalog starts empty. It lives
// in the facade because it writes rows of identity, storefront, inventory and catalog.
func (s *Service) SignUp(ctx context.Context, at string, in SignUpInput, passwordHash string) (*Delta, domain.User, error) {
	in.StoreName, in.OwnerName = strings.TrimSpace(in.StoreName), strings.TrimSpace(in.OwnerName)
	var owner domain.User
	switch {
	case in.StoreName == "" || len(in.StoreName) > 80:
		return nil, owner, kernel.Invalid{Reason: "Name your store in 80 characters or fewer."}
	case in.OwnerName == "" || len(in.OwnerName) > 120:
		return nil, owner, kernel.Invalid{Reason: "Enter your name in 120 characters or fewer."}
	case !slices.Contains(industries, in.Industry):
		return nil, owner, kernel.Invalid{Reason: "Choose what you sell."}
	case !slices.Contains(signUpTemplates, in.TemplateID):
		return nil, owner, kernel.Invalid{Reason: "Choose a look for your store."}
	}
	if err := identity.ValidSubdomain(in.Subdomain); err != nil {
		return nil, owner, err
	}
	tenantID := ids.New("ten")
	owner = domain.User{
		ID: ids.New("usr"), Name: in.OwnerName, Email: in.Email, Title: "Owner", Role: "tenant_admin",
		TenantIDs: []string{tenantID}, Color: "#4c5a78",
	}
	d, err := s.Run(ctx, func(t *kernel.Tx) error {
		template, err := kernel.Get[domain.Template](t, "templates", in.TemplateID, "template")
		if err != nil {
			return err
		}
		code, err := identity.FreeTenantCode(t, in.StoreName)
		if err != nil {
			return err
		}
		tenant := newStoreTenant(tenantID, code, at, in)
		if err := identity.AddTenant(t, tenant); err != nil {
			return err
		}
		if err := identity.CreateUser(t, owner, passwordHash); err != nil {
			return err
		}
		page := draftHome(tenant, template, at, owner.ID)
		if err := t.Put("pages", page.ID, page); err != nil {
			return err
		}
		warehouse := domain.Warehouse{ID: ids.New("wh"), TenantID: tenantID, Code: "MAIN", Name: "Main warehouse", City: "Jakarta"}
		if err := t.Put("warehouses", warehouse.ID, warehouse); err != nil {
			return err
		}
		for i, method := range []struct{ method, name, instructions string }{
			{"bank_transfer", "Manual bank transfer", "Transfer the total to the account the store sends you, then keep the receipt."},
			{"cod", "Cash on delivery", "Pay the courier in cash when the order arrives."},
		} {
			p := domain.PaymentType{
				ID: ids.New("pay"), TenantID: tenantID, Name: method.name, Method: method.method, Provider: "Manual",
				Enabled: true, Instructions: method.instructions, Sort: i,
			}
			if err := t.Put("paymentTypes", p.ID, p); err != nil {
				return err
			}
		}
		return nil
	})
	return d, owner, err
}

func newStoreTenant(id, code, at string, in SignUpInput) domain.Tenant {
	return domain.Tenant{
		ID: id, Code: code, Name: in.StoreName, Industry: in.Industry, Plan: "starter", Subdomain: in.Subdomain,
		CreatedAt: at, Source: "signup", Onboarding: slices.Clone(signUpSteps),
		// DEFAULT_BRAND_COLORS and BRAND_FONT, as the onboarding wizard starts a store.
		Brand: domain.BrandConfig{
			Colors: domain.BrandColors{Primary: "#2f4a5a", Secondary: "#23292d", Accent: "#c19a6b", Background: "#faf8f5", Text: "#1c1d1f"},
			Fonts:  domain.BrandFonts{Heading: "DM Sans", Body: "DM Sans"},
			Theme:  "theme1", Radius: "soft", ButtonStyle: "solid", Personality: "modern", Tone: "friendly",
			Locks: map[string]bool{"logo": true, "primary_color": true, "button_style": true, "hero_image": false,
				"headline": false, "featured_product": false, "layout": false},
		},
		Loyalty: domain.LoyaltyConfig{
			PointsPer10k: 1, Thresholds: domain.LoyaltyThresholds{Silver: 1_500_000, Gold: 5_000_000, Platinum: 10_000_000},
			FreeShippingMin: 500_000,
		},
	}
}

// draftHome lays the template's sections out with placeholder copy: the store name in the hero and
// footer, and each other section titled by its kind until the owner writes their own.
func draftHome(tenant domain.Tenant, template domain.Template, at, by string) domain.Page {
	pageID := ids.New("page")
	placeholders := make([]domain.PageSection, 0, len(template.Sections))
	for _, ts := range template.Sections {
		section := domain.PageSection{ID: ids.New("sec"), Kind: ts.Kind, Headline: rules.SectionKindLabel[ts.Kind], ProductIDs: []string{}}
		switch ts.Kind {
		case "hero":
			section.Headline, section.Body, section.CtaLabel = "Welcome to "+tenant.Name, "Explore our products.", "Shop now"
		case "footer":
			section.Headline = tenant.Name
		}
		placeholders = append(placeholders, section)
	}
	sections := rules.ApplyTemplate(placeholders, template, pageID)
	return domain.Page{
		ID: pageID, TenantID: tenant.ID, Title: "Homepage", Slug: "/", Kind: "home", TemplateID: template.ID,
		Status: "draft", Sections: sections, Seo: domain.PageSeo{Title: tenant.Name + " · Home"},
		UpdatedAt: at, UpdatedBy: by,
		Revisions: []domain.PageRevision{{ID: ids.New("rev"), At: at, By: by, Note: "Created at sign-up", Sections: sections, TemplateID: template.ID}},
	}
}
