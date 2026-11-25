package rules

import (
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// Personal data erasure (UU PDP Pasal 8 and 43 to 45, PP 80/2019 Pasal 59) and marketing consent
// (UU PDP Pasal 20 to 24). Mirrors packages/fixtures/src/privacy.ts.

// ErasedName and ErasedText replace a customer's name and their free text after erasure.
const (
	ErasedName = "Erased customer"
	ErasedText = "Erased"
)

// ErasedEventKinds are the history rows whose label holds what the shopper or staff typed.
var ErasedEventKinds = map[string]bool{"note": true, "review": true, "support": true, "search": true}

// ConsentSources are where a shopper can give or withdraw marketing consent.
var ConsentSources = map[string]bool{"checkout": true, "account": true, "staff": true, "unsubscribe": true, "request": true}

// beforeDelivery are the order statuses that still need the shopper's contact details.
var beforeDelivery = map[string]bool{"new": true, "confirmed": true, "paid": true, "processing": true, "packed": true, "shipped": true}

var openReturn = map[string]bool{"requested": true, "approved": true, "received": true}

// CustomerEraseBlocker refuses erasure while the courier or a refund still needs the shopper's
// contact details, and for a customer already erased.
func CustomerEraseBlocker(c domain.Customer, orders []domain.Order, returns []domain.OrderReturn) string {
	if c.ErasedAt != "" {
		return "This customer's personal data is already erased."
	}
	var waiting []string
	for _, o := range orders {
		if beforeDelivery[o.Status] {
			waiting = append(waiting, o.Code)
		}
	}
	if len(waiting) > 0 {
		return "Deliver or cancel " + strings.Join(waiting, ", ") + " first. The courier still needs the contact details."
	}
	for _, r := range returns {
		if openReturn[r.Status] {
			return "Close return " + r.Code + " first. The refund still needs the contact details."
		}
	}
	return ""
}

// EraseCustomer replaces the customer's personal data with placeholders. Code, points, tier and
// dates stay, so orders and loyalty still add up.
func EraseCustomer(c domain.Customer, at string) domain.Customer {
	c.Name, c.Email, c.Phone, c.City = ErasedName, "", "", ""
	c.Birthday = nil
	c.Tags, c.Interests = []string{}, []string{}
	c.MarketingConsent = nil
	c.ErasedAt = at
	return c
}

// MarketingAllowed reports whether a marketing message may go to the customer: only with consent
// they gave and have not withdrawn.
func MarketingAllowed(c domain.Customer) bool {
	return c.ErasedAt == "" && c.MarketingConsent != nil && c.MarketingConsent.Granted
}

// MarketingAllowedSQL mirrors MarketingAllowed as a SQL condition on a customers row read as c.
const MarketingAllowedSQL = `(coalesce(c.data->>'erasedAt', '') = '' and coalesce((c.data->'marketingConsent'->>'granted')::boolean, false))`

// ConsentBlocker refuses a consent change that changes nothing or comes from an unknown place.
func ConsentBlocker(c domain.Customer, granted bool, source, textVersion string) string {
	if c.ErasedAt != "" {
		return "This customer's personal data is erased."
	}
	if !ConsentSources[source] {
		return "Unknown consent source."
	}
	if granted && strings.TrimSpace(textVersion) == "" {
		return "Name the wording the shopper agreed to."
	}
	if MarketingAllowed(c) == granted {
		if granted {
			return "This customer already agreed to marketing messages."
		}
		return "This customer already receives no marketing messages."
	}
	return ""
}

// ConsentLabel is the history line for a consent change.
func ConsentLabel(granted bool, source string) string {
	if granted {
		return "Agreed to marketing messages · " + source
	}
	return "Withdrew marketing consent · " + source
}
