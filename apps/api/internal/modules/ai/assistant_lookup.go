package ai

import (
	"context"
	"maps"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"
)

// A lookup is a read the model asks for when the facts do not hold the record a question names.
// The model only names a type and a query; the HTTP layer runs it, scoped to the tenant and the
// person's role, and this file checks the request as strictly as an action.

const (
	maxLookupQuery = 60
	// LookupRows caps the rows one lookup returns.
	LookupRows = 8
)

// Lookup types.
const (
	LookupOrders     = "orders"
	LookupCustomers  = "customers"
	LookupProducts   = "products"
	LookupPromotions = "promotions"
	LookupCampaigns  = "campaigns"
	LookupTickets    = "tickets"
	LookupLeads      = "leads"
)

// LookupRequest is one lookup the model asked for.
type LookupRequest struct {
	Type  string `json:"type"`
	Query string `json:"query"`
}

// LookupResult is what one lookup found, in the same shapes as the facts. It holds no email, phone
// or address.
type LookupResult struct {
	Type       string          `json:"type"`
	Query      string          `json:"query"`
	Orders     []OrderFact     `json:"orders,omitempty"`
	Customers  []CustomerFact  `json:"customers,omitempty"`
	Products   []ProductFact   `json:"products,omitempty"`
	Promotions []PromotionFact `json:"promotions,omitempty"`
	Campaigns  []CampaignFact  `json:"campaigns,omitempty"`
	Tickets    []TicketFact    `json:"tickets,omitempty"`
	Leads      []LeadFact      `json:"leads,omitempty"`
	// Note says when nothing matched or the list was cut.
	Note string `json:"note,omitempty"`
}

// Lookup runs one checked request.
type Lookup func(ctx context.Context, req LookupRequest) (LookupResult, error)

// lookupSpec describes one type to the model. A sales user reads only what is their own, so the
// types without that rule are closed to them.
type lookupSpec struct {
	query   string
	ownRule bool
}

var lookupSpecs = map[string]lookupSpec{
	LookupOrders:     {query: "an order code, a status (new, confirmed, paid, processing, packed, shipped, delivered, completed, cancelled, returned, refunded) or a customer code", ownRule: true},
	LookupCustomers:  {query: "a customer code or part of a name", ownRule: true},
	LookupProducts:   {query: "part of a product name, a product code or a SKU; the result has stock per warehouse with levelIds"},
	LookupPromotions: {query: "part of a promotion name or its code"},
	LookupCampaigns:  {query: "part of a campaign name"},
	LookupTickets:    {query: "a status: open, pending or resolved"},
	LookupLeads:      {query: "a lead code or a stage (new, qualified, proposal, negotiation, won, lost)", ownRule: true},
}

// lookupKinds lists the types this person may use, in name order.
func lookupKinds(f AssistantFacts) []string {
	kinds := slices.Sorted(maps.Keys(lookupSpecs))
	return slices.DeleteFunc(kinds, func(kind string) bool { return f.OwnOnly && !lookupSpecs[kind].ownRule })
}

// queryText is what a query may hold: letters, digits, spaces and the marks codes and names use.
var queryText = regexp.MustCompile(`^[\p{L}\p{N} ._'&/+-]+$`)

// checkLookups keeps at most limit requests of a known type the person may use, with a plain query.
// Anything else is dropped, as is a repeat.
func checkLookups(asked []LookupRequest, f AssistantFacts, limit int) []LookupRequest {
	kinds := lookupKinds(f)
	out := []LookupRequest{}
	for _, req := range asked {
		req.Type, req.Query = strings.TrimSpace(req.Type), strings.Join(strings.Fields(req.Query), " ")
		if len(out) == limit {
			break
		}
		if !slices.Contains(kinds, req.Type) || req.Query == "" || utf8.RuneCountInString(req.Query) > maxLookupQuery ||
			!queryText.MatchString(req.Query) || slices.Contains(out, req) {
			continue
		}
		out = append(out, req)
	}
	return out
}

// absorb makes the records a lookup returned valid targets for actions and links.
func (f *AssistantFacts) absorb(res LookupResult) {
	for _, o := range res.Orders {
		f.Found.Orders = append(f.Found.Orders, o)
		f.Know(KnownOrders, o.ID)
	}
	for _, c := range res.Customers {
		f.Found.Customers = append(f.Found.Customers, c)
		f.Know(KnownCustomers, c.ID)
	}
	for _, p := range res.Products {
		f.Found.Products = append(f.Found.Products, p)
		f.Found.Levels = append(f.Found.Levels, p.Stock...)
		f.Know(KnownProducts, p.ID)
	}
	for _, p := range res.Promotions {
		f.Found.Promotions = append(f.Found.Promotions, p)
		f.Know(KnownPromotions, p.ID)
	}
	for _, c := range res.Campaigns {
		f.Found.Campaigns = append(f.Found.Campaigns, c)
		f.Know(KnownCampaigns, c.ID)
	}
	f.Found.Tickets = append(f.Found.Tickets, res.Tickets...)
	f.Found.Leads = append(f.Found.Leads, res.Leads...)
}

var (
	emailLike = regexp.MustCompile(`[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+`)
	// phoneLike is a run of digits with the spaces, dots, dashes and brackets phone numbers use.
	// Redact keeps runs under nine digits: order codes, dates and most prices.
	phoneLike = regexp.MustCompile(`\+?\(?\d[\d ().-]{5,}\d`)
)

// Redact replaces email addresses and phone numbers in free text: the question the log keeps and
// the ticket subjects the facts show.
func Redact(text string) string {
	text = emailLike.ReplaceAllString(text, "[email]")
	return phoneLike.ReplaceAllStringFunc(text, func(m string) string {
		digits := 0
		for _, r := range m {
			if r >= '0' && r <= '9' {
				digits++
			}
		}
		if digits < 9 {
			return m
		}
		return "[phone]"
	})
}
