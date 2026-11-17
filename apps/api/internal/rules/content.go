package rules

import (
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// Limits on the copy a seller writes and on a store's menus; packages/fixtures/src/rules.ts holds
// the same numbers.
const (
	SellerHeadlineMax = 80
	SellerBioMax      = 400
	MenuLabelMax      = 40
	HeaderLinksMax    = 8
	FooterLinksMax    = 12
)

var (
	fullLink  = regexp.MustCompile(`(?i)^https?://\S+$`)
	storePath = regexp.MustCompile(`^/(?:[^/\s]\S*)?$`)
)

// ValidLink mirrors validLink: a full http or https link, or a store path that starts with one slash.
func ValidLink(href string) bool { return fullLink.MatchString(href) || storePath.MatchString(href) }

// SellerProfile is the part of a seller record the seller writes themselves.
type SellerProfile struct {
	Headline string `json:"headline"`
	Bio      string `json:"bio"`
	PhotoURL string `json:"photoUrl"`
}

// CleanSellerProfile mirrors cleanSellerProfile.
func CleanSellerProfile(in SellerProfile) SellerProfile {
	return SellerProfile{
		Headline: strings.TrimSpace(in.Headline), Bio: strings.TrimSpace(in.Bio), PhotoURL: strings.TrimSpace(in.PhotoURL),
	}
}

// SellerProfileBlocker mirrors sellerProfileBlocker. bound is true when the brand's locks apply:
// the seller edits their own profile and does not manage sellers.
func SellerProfileBlocker(s domain.Seller, in SellerProfile, locks map[string]bool, bound bool) string {
	switch {
	case utf8.RuneCountInString(in.Headline) > SellerHeadlineMax:
		return "Keep the headline to 80 characters."
	case utf8.RuneCountInString(in.Bio) > SellerBioMax:
		return "Keep the bio to 400 characters."
	case in.PhotoURL != "" && !ValidLink(in.PhotoURL):
		return "Upload the photo again. Its address is not a valid link."
	case bound && locks["headline"] && (in.Headline != s.Headline || in.Bio != s.Bio):
		return "Your brand team locked the headline and bio."
	case bound && locks["hero_image"] && in.PhotoURL != s.PhotoURL:
		return "Your brand team locked the photo."
	}
	return ""
}

var menuKinds = map[string]bool{"page": true, "category": true, "collection": true, "catalog": true, "url": true}

// CleanMenus mirrors cleanMenus: labels trimmed, and each target keeps only the field its kind uses.
func CleanMenus(m domain.StoreMenus) domain.StoreMenus {
	clean := func(links []domain.MenuLink) []domain.MenuLink {
		out := make([]domain.MenuLink, 0, len(links))
		for _, l := range links {
			target := domain.MenuTarget{Kind: l.Target.Kind}
			switch l.Target.Kind {
			case "page", "category", "collection":
				target.ID = strings.TrimSpace(l.Target.ID)
			case "url":
				target.URL = strings.TrimSpace(l.Target.URL)
			}
			out = append(out, domain.MenuLink{Label: strings.TrimSpace(l.Label), Target: target})
		}
		return out
	}
	return domain.StoreMenus{Header: clean(m.Header), Footer: clean(m.Footer)}
}

// MenusBlocker mirrors menusBlocker; it reads menus that CleanMenus has been through.
func MenusBlocker(m domain.StoreMenus) string {
	if len(m.Header) > HeaderLinksMax {
		return "The header holds up to 8 links."
	}
	if len(m.Footer) > FooterLinksMax {
		return "The footer holds up to 12 links."
	}
	for _, l := range append(append([]domain.MenuLink{}, m.Header...), m.Footer...) {
		switch {
		case l.Label == "":
			return "Give every link a label."
		case utf8.RuneCountInString(l.Label) > MenuLabelMax:
			return "Keep link labels to 40 characters."
		case !menuKinds[l.Target.Kind]:
			return "Choose where the link " + l.Label + " goes."
		case l.Target.Kind == "url" && !ValidLink(l.Target.URL):
			return "The link " + l.Label + " needs a full https address or a store path that starts with /."
		case l.Target.Kind != "url" && l.Target.Kind != "catalog" && l.Target.ID == "":
			return "Choose where the link " + l.Label + " goes."
		}
	}
	return ""
}
