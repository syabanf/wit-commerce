package storefront

import (
	"context"
	"errors"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"

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

// draftOf loads a page's unpublished changes for update, or nil when it has none.
func draftOf(t *kernel.Tx, pageID string) (*domain.PageDraft, error) {
	d, err := store.Lock[domain.PageDraft](t.Ctx, t.Tx, "pageDrafts", pageID)
	if errors.Is(err, store.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// editsGoToDraft: edits wait in a draft while the page is live or scheduled, or already has
// unpublished changes.
func editsGoToDraft(p domain.Page, d *domain.PageDraft) bool {
	return p.Status != "draft" || d != nil
}

// withDraft is the page as it would go live: its unpublished changes laid over it.
func withDraft(p domain.Page, d *domain.PageDraft) domain.Page {
	if d != nil {
		p.Sections, p.Seo, p.TemplateID = d.Sections, d.Seo, d.TemplateID
	}
	return p
}

// putDraft writes a live page's unpublished changes; the page stays as shoppers see it.
func putDraft(t *kernel.Tx, m kernel.Meta, p domain.Page, sections []domain.PageSection, seo domain.PageSeo, templateID string) error {
	d := domain.PageDraft{ID: p.ID, TenantID: p.TenantID, Sections: sections, Seo: seo, TemplateID: templateID, UpdatedAt: m.At, UpdatedBy: m.By()}
	return t.Put("pageDrafts", d.ID, d)
}

// lockPage loads a page and its draft for update and checks the caller may change it.
func lockPage(t *kernel.Tx, m kernel.Meta, id string) (domain.Page, *domain.PageDraft, error) {
	p, err := kernel.Lock[domain.Page](t, "pages", id, "page")
	if err != nil {
		return p, nil, err
	}
	if err := kernel.Access(m, p.TenantID); err != nil {
		return p, nil, err
	}
	d, err := draftOf(t, p.ID)
	return p, d, err
}

// SavePage is pages/save: on a live page the content waits in its draft; otherwise the page takes
// the content and a revision.
func (s *Storefront) SavePage(ctx context.Context, m kernel.Meta, id string, in SavePageInput) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		p, d, err := lockPage(t, m, id)
		if err != nil {
			return err
		}
		if in.Sections == nil {
			in.Sections = []domain.PageSection{}
		}
		if editsGoToDraft(p, d) {
			base := withDraft(p, d)
			if in.Seo != nil {
				base.Seo = *in.Seo
			}
			return putDraft(t, m, p, in.Sections, base.Seo, base.TemplateID)
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
		p, d, err := lockPage(t, m, id)
		if err != nil {
			return err
		}
		template, err := kernel.Get[domain.Template](t, "templates", templateID, "template")
		if err != nil {
			return err
		}
		base := withDraft(p, d)
		if base.TemplateID == template.ID {
			return nil
		}
		sections := rules.ApplyTemplate(base.Sections, template, p.ID)
		if editsGoToDraft(p, d) {
			return putDraft(t, m, p, sections, base.Seo, template.ID)
		}
		p.TemplateID = template.ID
		p.Sections = sections
		p.UpdatedAt, p.UpdatedBy = m.At, m.By()
		prependRevision(&p, revision(m.At, m.By(), "Switched to "+template.Name, p.Sections, template.ID))
		return t.Put("pages", p.ID, p)
	})
}

// publish puts the page live with its draft applied, records the version and drops the draft.
func publish(t *kernel.Tx, p domain.Page, d *domain.PageDraft, at, by string) error {
	p = withDraft(p, d)
	prependRevision(&p, revision(at, by, "Published", p.Sections, p.TemplateID))
	if err := t.Put("pages", p.ID, p); err != nil {
		return err
	}
	if d == nil {
		return nil
	}
	return t.Del("pageDrafts", d.ID)
}

// PublishPage is pages/publish: the draft, when there is one, is what goes live.
func (s *Storefront) PublishPage(ctx context.Context, m kernel.Meta, id string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		p, d, err := lockPage(t, m, id)
		if err != nil {
			return err
		}
		if why := rules.PagePublishBlocker(withDraft(p, d)); why != "" {
			return kernel.Refuse(why)
		}
		p.Status = "published"
		p.PublishedAt = kernel.Ptr(m.At)
		p.ScheduledAt = nil
		return publish(t, p, d, m.At, m.By())
	})
}

// PublishDue is the timer's part of system/tick: scheduled pages whose time has come go live with
// their draft, unless the draft would not pass the checks, in which case it stays a draft.
func PublishDue(t *kernel.Tx, at string) error {
	now := clock.Ms(at)
	pages, err := store.List[domain.Page](t.Ctx, t.Tx, "pages", "status = 'scheduled' for update")
	if err != nil {
		return err
	}
	for _, p := range pages {
		if p.ScheduledAt == nil || clock.Ms(*p.ScheduledAt) > now {
			continue
		}
		p.Status = "published"
		p.PublishedAt = p.ScheduledAt
		p.ScheduledAt = nil
		d, err := draftOf(t, p.ID)
		if err != nil {
			return err
		}
		if d != nil && rules.PagePublishBlocker(withDraft(p, d)) == "" {
			err = publish(t, p, d, at, "system")
		} else {
			err = t.Put("pages", p.ID, p)
		}
		if err != nil {
			return err
		}
	}
	return nil
}

// SchedulePage is pages/schedule. The draft stays and goes live with the page.
func (s *Storefront) SchedulePage(ctx context.Context, m kernel.Meta, id, at string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		p, d, err := lockPage(t, m, id)
		if err != nil {
			return err
		}
		if why := rules.PagePublishBlocker(withDraft(p, d)); why != "" {
			return kernel.Refuse(why)
		}
		p.Status = "scheduled"
		p.ScheduledAt = kernel.Ptr(at)
		return t.Put("pages", p.ID, p)
	})
}

// UnpublishPage is pages/unpublish. Any draft stays.
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

// RollbackPage is pages/rollback. On a live page the restored version waits in the draft.
func (s *Storefront) RollbackPage(ctx context.Context, m kernel.Meta, id, revisionID string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		p, d, err := lockPage(t, m, id)
		if err != nil {
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
		if editsGoToDraft(p, d) {
			return putDraft(t, m, p, rev.Sections, withDraft(p, d).Seo, rev.TemplateID)
		}
		p.Sections = rev.Sections
		p.TemplateID = rev.TemplateID
		p.UpdatedAt, p.UpdatedBy = m.At, m.By()
		prependRevision(&p, revision(m.At, m.By(), "Rolled back to "+strings.ToLower(rev.Note), rev.Sections, rev.TemplateID))
		return t.Put("pages", p.ID, p)
	})
}

// DiscardPageDraft is pages/discardDraft: the page's unpublished changes go away.
func (s *Storefront) DiscardPageDraft(ctx context.Context, m kernel.Meta, id string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		_, d, err := lockPage(t, m, id)
		if err != nil || d == nil {
			return err
		}
		return t.Del("pageDrafts", d.ID)
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
