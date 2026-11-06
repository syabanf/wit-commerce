package storefront

import (
	"context"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

const revisionsKept = 12

func revision(at, by, note string, sections []domain.PageSection, templateID string) domain.PageRevision {
	return domain.PageRevision{ID: ids.New("rev"), At: at, By: by, Note: note, Sections: sections, TemplateID: templateID}
}

func prependRevision(p *domain.Page, r domain.PageRevision) {
	p.Revisions = append([]domain.PageRevision{r}, p.Revisions...)
	if len(p.Revisions) > revisionsKept {
		p.Revisions = p.Revisions[:revisionsKept]
	}
}

// CreatePage is pages/create.
func (s *Storefront) CreatePage(ctx context.Context, m kernel.Meta, p domain.Page) (*kernel.Delta, error) {
	if err := kernel.Access(m, p.TenantID); err != nil {
		return nil, err
	}
	return s.Run(ctx, func(t *kernel.Tx) error { return t.Put("pages", p.ID, p) })
}

// SavePageInput is pages/save.
type SavePageInput struct {
	Sections []domain.PageSection `json:"sections"`
	Seo      *domain.PageSeo      `json:"seo"`
	Note     string               `json:"note"`
}

// SavePage is pages/save: new content and a revision.
func (s *Storefront) SavePage(ctx context.Context, m kernel.Meta, id string, in SavePageInput) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		p, err := kernel.Lock[domain.Page](t, "pages", id, "page")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, p.TenantID); err != nil {
			return err
		}
		if in.Sections == nil {
			in.Sections = []domain.PageSection{}
		}
		p.Sections = in.Sections
		if in.Seo != nil {
			p.Seo = *in.Seo
		}
		p.UpdatedAt, p.UpdatedBy = m.At, m.By()
		prependRevision(&p, revision(m.At, m.By(), in.Note, in.Sections, p.TemplateID))
		return t.Put("pages", p.ID, p)
	})
}

// SetPageTemplate is pages/setTemplate: the content moves into the new template's sections.
func (s *Storefront) SetPageTemplate(ctx context.Context, m kernel.Meta, id, templateID string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		p, err := kernel.Lock[domain.Page](t, "pages", id, "page")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, p.TenantID); err != nil {
			return err
		}
		template, err := kernel.Get[domain.Template](t, "templates", templateID, "template")
		if err != nil {
			return err
		}
		if p.TemplateID == template.ID {
			return nil
		}
		p.TemplateID = template.ID
		p.Sections = rules.ApplyTemplate(p.Sections, template, p.ID)
		p.UpdatedAt, p.UpdatedBy = m.At, m.By()
		prependRevision(&p, revision(m.At, m.By(), "Switched to "+template.Name, p.Sections, template.ID))
		return t.Put("pages", p.ID, p)
	})
}

// PublishPage is pages/publish.
func (s *Storefront) PublishPage(ctx context.Context, m kernel.Meta, id string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		p, err := kernel.Lock[domain.Page](t, "pages", id, "page")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, p.TenantID); err != nil {
			return err
		}
		if why := rules.PagePublishBlocker(p); why != "" {
			return kernel.Refuse(why)
		}
		p.Status = "published"
		p.PublishedAt = kernel.Ptr(m.At)
		p.ScheduledAt = nil
		prependRevision(&p, revision(m.At, m.By(), "Published", p.Sections, p.TemplateID))
		return t.Put("pages", p.ID, p)
	})
}

// SchedulePage is pages/schedule.
func (s *Storefront) SchedulePage(ctx context.Context, m kernel.Meta, id, at string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		p, err := kernel.Lock[domain.Page](t, "pages", id, "page")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, p.TenantID); err != nil {
			return err
		}
		if why := rules.PagePublishBlocker(p); why != "" {
			return kernel.Refuse(why)
		}
		p.Status = "scheduled"
		p.ScheduledAt = kernel.Ptr(at)
		return t.Put("pages", p.ID, p)
	})
}

// UnpublishPage is pages/unpublish.
func (s *Storefront) UnpublishPage(ctx context.Context, m kernel.Meta, id string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		p, err := kernel.Lock[domain.Page](t, "pages", id, "page")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, p.TenantID); err != nil {
			return err
		}
		p.Status = "draft"
		p.ScheduledAt = nil
		return t.Put("pages", p.ID, p)
	})
}

// RollbackPage is pages/rollback.
func (s *Storefront) RollbackPage(ctx context.Context, m kernel.Meta, id, revisionID string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		p, err := kernel.Lock[domain.Page](t, "pages", id, "page")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, p.TenantID); err != nil {
			return err
		}
		var rev *domain.PageRevision
		for i := range p.Revisions {
			if p.Revisions[i].ID == revisionID {
				rev = &p.Revisions[i]
			}
		}
		if rev == nil {
			return kernel.NotFound{What: "revision"}
		}
		p.Sections = rev.Sections
		p.TemplateID = rev.TemplateID
		p.UpdatedAt, p.UpdatedBy = m.At, m.By()
		prependRevision(&p, revision(m.At, m.By(), "Rolled back to "+strings.ToLower(rev.Note), rev.Sections, rev.TemplateID))
		return t.Put("pages", p.ID, p)
	})
}

// --- sellers ---

func sellerPage(t *kernel.Tx, sellerID string) (*domain.Page, error) {
	pages, err := store.List[domain.Page](t.Ctx, t.Tx, "pages", "seller_id = $1 for update", sellerID)
	if err != nil || len(pages) == 0 {
		return nil, err
	}
	return &pages[0], nil
}

// syncSellerPage keeps a seller's page in step with the record: a new seller gets a draft page from
// their template, and featured products flow into the page's product section.
func syncSellerPage(t *kernel.Tx, seller domain.Seller, m kernel.Meta) error {
	page, err := sellerPage(t, seller.ID)
	if err != nil {
		return err
	}
	if page != nil {
		changed := false
		for i := range page.Sections {
			if page.Sections[i].Kind == "featured_product" {
				page.Sections[i].ProductIDs = seller.FeaturedProductIDs
				changed = true
			}
		}
		if !changed {
			return nil
		}
		return t.Put("pages", page.ID, *page)
	}
	template, err := store.Get[domain.Template](t.Ctx, t.Tx, "templates", seller.TemplateID)
	if err != nil {
		return nil
	}
	id := "page-" + seller.ID
	headline := seller.Headline
	if headline == "" {
		headline = seller.Name
	}
	sections := rules.ApplyTemplate([]domain.PageSection{
		{ID: id + "-hero", Kind: "hero", Rule: "required", Headline: headline, Body: seller.Bio, ProductIDs: []string{}, CtaLabel: "Chat on WhatsApp"},
		{ID: id + "-picks", Kind: "featured_product", Rule: "required", Headline: rules.FirstName(seller.Name) + "'s picks", ProductIDs: seller.FeaturedProductIDs},
	}, template, id)
	seoHeadline := seller.Headline
	if seoHeadline == "" {
		seoHeadline = "Personal store"
	}
	created := domain.Page{
		ID: id, TenantID: seller.TenantID, Title: seller.Name + " · personal store", Slug: "/" + seller.Slug,
		Kind: "personal", TemplateID: template.ID, SellerID: kernel.Ptr(seller.ID), Status: "draft", Sections: sections,
		Seo:       domain.PageSeo{Title: seller.Name + " · " + seoHeadline, Description: seller.Bio},
		UpdatedAt: m.At, UpdatedBy: m.By(), PublishedAt: nil, ScheduledAt: nil,
		Revisions: []domain.PageRevision{revision(m.At, m.By(), "Created from template", sections, template.ID)},
		Views30d:  0,
	}
	return t.Put("pages", created.ID, created)
}

// SaveSeller is sellers/save.
func (s *Storefront) SaveSeller(ctx context.Context, m kernel.Meta, seller domain.Seller) (*kernel.Delta, error) {
	if err := kernel.Access(m, seller.TenantID); err != nil {
		return nil, err
	}
	return s.Run(ctx, func(t *kernel.Tx) error {
		if err := t.Put("sellers", seller.ID, seller); err != nil {
			return err
		}
		return syncSellerPage(t, seller, m)
	})
}

// SetSellerTemplate is sellers/setTemplate: the page keeps its content in the new layout.
func (s *Storefront) SetSellerTemplate(ctx context.Context, m kernel.Meta, id, templateID string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		seller, err := kernel.Lock[domain.Seller](t, "sellers", id, "seller")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, seller.TenantID); err != nil {
			return err
		}
		if why := rules.SellerTemplateBlocker(seller, templateID); why != "" {
			return kernel.Refuse(why)
		}
		seller.TemplateID = templateID
		if err := t.Put("sellers", seller.ID, seller); err != nil {
			return err
		}
		template, err := store.Get[domain.Template](t.Ctx, t.Tx, "templates", templateID)
		if err != nil {
			return nil
		}
		page, err := sellerPage(t, seller.ID)
		if err != nil || page == nil {
			return err
		}
		page.TemplateID = template.ID
		page.Sections = rules.ApplyTemplate(page.Sections, template, page.ID)
		page.UpdatedAt, page.UpdatedBy = m.At, m.By()
		return t.Put("pages", page.ID, *page)
	})
}

// SetSellerStatus is sellers/setStatus.
func (s *Storefront) SetSellerStatus(ctx context.Context, m kernel.Meta, id, status string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		seller, err := kernel.Lock[domain.Seller](t, "sellers", id, "seller")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, seller.TenantID); err != nil {
			return err
		}
		seller.Status = status
		return t.Put("sellers", seller.ID, seller)
	})
}
