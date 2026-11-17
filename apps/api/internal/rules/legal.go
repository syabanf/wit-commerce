package rules

import (
	"fmt"
	"hash/fnv"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// Seller identity, complaint service, terms and delivery estimates mirror
// packages/fixtures/src/legal.ts (PP 80/2019 Pasal 9, 13, 27, 39, 53 and 66).

// DefaultComplaintDays is how many working days a brand takes to resolve a complaint when it set none.
const DefaultComplaintDays = 3

// TermsRevision mirrors TERMS_REVISION: raise both when the generated terms change wording.
const TermsRevision = 1

var (
	BusinessTypes = []string{"perorangan", "cv", "pt"}
	DisputeForums = []string{"court", "bpsk", "arbitration"}
	// Couriers are the couriers a store may offer, in the order of DEFAULT_COURIER_ETA.
	Couriers = []string{"jne", "jnt", "sicepat", "grab", "gojek", "lalamove", "pickup"}

	emailPattern = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
	phonePattern = regexp.MustCompile(`^[0-9+() -]+$`)
	nibPattern   = regexp.MustCompile(`^\d{13}$`)
	npwpPattern  = regexp.MustCompile(`^[0-9.-]+$`)
)

// ComplaintDays mirrors complaintDays.
func ComplaintDays(t domain.Tenant) int {
	if t.Legal == nil || t.Legal.ComplaintDays == nil {
		return DefaultComplaintDays
	}
	return *t.Legal.ComplaintDays
}

func chars(s string) int { return utf8.RuneCountInString(s) }

func digitCount(s string) int {
	n := 0
	for _, r := range s {
		if r >= '0' && r <= '9' {
			n++
		}
	}
	return n
}

func phoneProblem(phone string) string {
	if d := digitCount(phone); phonePattern.MatchString(phone) && d >= 8 && d <= 15 {
		return ""
	}
	return "Enter a phone number of 8 to 15 digits."
}

// NormalizeLegal mirrors normalizeLegal: every text field trimmed.
func NormalizeLegal(l domain.SellerLegal) domain.SellerLegal {
	for _, field := range []*string{&l.EntityName, &l.BusinessType, &l.NIB, &l.NPWP, &l.Address, &l.City, &l.Phone,
		&l.Email, &l.Hours, &l.ComplaintProcedure, &l.DisputeForum, &l.DisputeVenue, &l.TermsExtra} {
		*field = strings.TrimSpace(*field)
	}
	return l
}

// LegalBlocker mirrors legalBlocker on a normalized record.
func LegalBlocker(l domain.SellerLegal) string {
	for _, limit := range []struct {
		value string
		max   int
		label string
	}{
		{l.EntityName, 120, "legal name"}, {l.Address, 300, "address"}, {l.City, 60, "city"},
		{l.Hours, 120, "service hours"}, {l.ComplaintProcedure, 2000, "complaint procedure"},
		{l.DisputeVenue, 120, "dispute venue"}, {l.TermsExtra, 4000, "extra terms"},
	} {
		if chars(limit.value) > limit.max {
			return fmt.Sprintf("Keep the %s within %d characters.", limit.label, limit.max)
		}
	}
	if l.BusinessType != "" && !slices.Contains(BusinessTypes, l.BusinessType) {
		return "Pick perorangan, CV or PT as the business type."
	}
	if l.NIB != "" && !nibPattern.MatchString(l.NIB) {
		return "The NIB has 13 digits."
	}
	if d := digitCount(l.NPWP); l.NPWP != "" && !(npwpPattern.MatchString(l.NPWP) && (d == 15 || d == 16)) {
		return "The NPWP has 15 or 16 digits."
	}
	if l.Phone != "" {
		if why := phoneProblem(l.Phone); why != "" {
			return why
		}
	}
	if l.Email != "" && !(emailPattern.MatchString(l.Email) && chars(l.Email) <= 120) {
		return "Enter a customer service email such as help@yourbrand.id."
	}
	if l.ComplaintDays != nil && (*l.ComplaintDays < 1 || *l.ComplaintDays > 30) {
		return "Set the complaint resolution time between 1 and 30 working days."
	}
	if l.DisputeForum != "" && !slices.Contains(DisputeForums, l.DisputeForum) {
		return "Pick a court, BPSK or arbitration for disputes."
	}
	return ""
}

// LegalEmpty reports a record with no field set, which the tenant then drops.
func LegalEmpty(l domain.SellerLegal) bool { return l == domain.SellerLegal{} }

// CourierEtaBlocker mirrors courierEtaBlocker. Couriers are checked in a fixed order, so the same
// map always gives the same sentence.
func CourierEtaBlocker(etas map[string]domain.EtaDays) string {
	keys := make([]string, 0, len(etas))
	for courier := range etas {
		keys = append(keys, courier)
	}
	slices.Sort(keys)
	for _, courier := range keys {
		if !slices.Contains(Couriers, courier) {
			return courier + " is not a courier stores offer."
		}
		eta := etas[courier]
		if eta.Min < 0 || eta.Max < eta.Min || eta.Max > 30 {
			return "Delivery days run from 0 to 30, and the earliest day comes first."
		}
	}
	return ""
}

// AddWorkingDays mirrors addWorkingDays: n working days (Monday to Friday, WIB) after at.
func AddWorkingDays(at string, n int) string {
	t, err := clock.Parse(at)
	if err != nil {
		return at
	}
	t = t.In(clock.WIB)
	for n > 0 {
		t = t.Add(24 * time.Hour)
		if wd := t.Weekday(); wd != time.Saturday && wd != time.Sunday {
			n--
		}
	}
	return clock.Iso(t)
}

// ComplaintBlocker mirrors complaintBlocker on the shopper's subject, message and contact.
func ComplaintBlocker(subject, message string, c domain.TicketContact) string {
	subject, message, c = strings.TrimSpace(subject), strings.TrimSpace(message), TrimContact(c)
	switch {
	case chars(subject) < 3 || chars(subject) > 120:
		return "Give your complaint a subject of 3 to 120 characters."
	case chars(message) < 10 || chars(message) > 2000:
		return "Describe the problem in 10 to 2000 characters."
	case c.Name == "" || chars(c.Name) > 80:
		return "Enter your name, up to 80 characters."
	case c.Email == "" && c.Phone == "":
		return "Leave an email or a phone number so we can reply."
	case c.Email != "" && !(emailPattern.MatchString(c.Email) && chars(c.Email) <= 120):
		return "Enter an email such as you@example.com."
	case c.Phone != "":
		return phoneProblem(c.Phone)
	}
	return ""
}

// TrimContact mirrors trimContact.
func TrimContact(c domain.TicketContact) domain.TicketContact {
	return domain.TicketContact{Name: strings.TrimSpace(c.Name), Email: strings.TrimSpace(c.Email), Phone: strings.TrimSpace(c.Phone)}
}

// TermsVersion mirrors termsVersion: the template revision and an FNV-1a hash of the brand's values
// the terms page prints.
func TermsVersion(t domain.Tenant) string {
	var l domain.SellerLegal
	if t.Legal != nil {
		l = *t.Legal
	}
	forum := l.DisputeForum
	if forum == "" {
		forum = "court"
	}
	parts := []string{
		strconv.Itoa(TermsRevision), t.Name, l.EntityName, l.BusinessType, l.NIB, l.NPWP, l.Address, l.City,
		l.Phone, l.Email, l.Hours, l.ComplaintProcedure, strconv.Itoa(ComplaintDays(t)), forum, l.DisputeVenue,
		l.TermsExtra, strconv.Itoa(ReturnWindowDays(t)),
	}
	var etas []string
	for _, c := range Couriers {
		if eta, ok := t.CourierEtaDays[c]; ok {
			etas = append(etas, fmt.Sprintf("%s:%d-%d", c, eta.Min, eta.Max))
		}
	}
	parts = append(parts, strings.Join(etas, ","))
	h := fnv.New32a()
	h.Write([]byte(strings.Join(parts, "\x1f")))
	return fmt.Sprintf("%d.%08x", TermsRevision, h.Sum32())
}
