package identity

import (
	"cmp"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Custom domains: a brand connects a domain it owns, proves it with DNS, and the store opens there.
// packages/fixtures/src/domains.ts holds the same rules for the demo.

const (
	// DomainTXTLabel is where the ownership record sits: _wit-commerce.{domain}.
	DomainTXTLabel = "_wit-commerce"
	// DomainMaxFailures is how many daily re-checks may fail in a row before a domain stops being served.
	DomainMaxFailures = 3
	// domainRecheckEvery is how often a verified domain's DNS is checked again.
	domainRecheckEvery = 24 * clock.Hour
	// domainRecheckBatch caps the DNS work of one timer run; the rest wait for the next minute.
	domainRecheckBatch = 20
)

// ErrDomainTaken refuses a domain another brand holds.
var ErrDomainTaken = kernel.Conflict{Code: "DOMAIN_TAKEN", Reason: "Another store already uses this domain."}

// Resolver is the part of net.Resolver a domain check asks. Tests pass a fake.
type Resolver interface {
	LookupTXT(ctx context.Context, name string) ([]string, error)
	LookupCNAME(ctx context.Context, host string) (string, error)
	LookupHost(ctx context.Context, host string) ([]string, error)
}

// DomainConfig is what the platform knows about itself for custom domains.
type DomainConfig struct {
	// Resolver answers DNS; nil means the system resolver.
	Resolver Resolver
	// Timeout bounds one domain's whole check; zero means 5 seconds.
	Timeout time.Duration
	// StoreRoot is the parent domain of store hosts. A domain's CNAME points at {subdomain}.{StoreRoot}.
	// Empty turns custom domains off, since nothing would serve them.
	StoreRoot string
	// PlatformHosts are other hosts no brand may claim, such as the console's.
	PlatformHosts []string
	// Target is another name a CNAME may point at (DOMAIN_TARGET), and TargetIPs the addresses A
	// records may hold (DOMAIN_TARGET_IPS), for root domains that cannot carry a CNAME.
	Target    string
	TargetIPs []string
}

func (c DomainConfig) resolver() Resolver {
	if c.Resolver != nil {
		return c.Resolver
	}
	return net.DefaultResolver
}

// BareDomain drops a leading www., so one brand holds a domain with and without it.
func BareDomain(name string) string { return strings.TrimPrefix(name, "www.") }

// hostOnly is a host in lowercase without a port or a trailing dot.
func hostOnly(host string) string {
	host = strings.ToLower(strings.TrimSpace(host))
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	return strings.TrimSuffix(host, ".")
}

var (
	hostnamePattern = regexp.MustCompile(`^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$`)
	ipv4Pattern     = regexp.MustCompile(`^\d{1,3}(?:\.\d{1,3}){3}$`)
	// privateEndings never resolve on the public internet.
	privateEndings = []string{"localhost", "local", "test", "example", "invalid", "internal", "lan", "home", "corp", "onion", "arpa"}
)

// ValidDomain checks the shape of a custom domain and refuses the platform's own hosts.
func (c DomainConfig) ValidDomain(name string) error {
	if name != strings.ToLower(name) {
		return kernel.Invalid{Reason: "Write the domain in lowercase letters."}
	}
	if ipv4Pattern.MatchString(name) || strings.Contains(name, ":") {
		return kernel.Invalid{Reason: "Use a domain name, not an IP address or a port."}
	}
	if len(name) > 253 || !hostnamePattern.MatchString(name) {
		return kernel.Invalid{Reason: "Enter a domain such as www.yourstore.com, without http:// or a path."}
	}
	if slices.Contains(privateEndings, name[strings.LastIndexByte(name, '.')+1:]) {
		return kernel.Invalid{Reason: "This domain is not on the public internet."}
	}
	bare := BareDomain(name)
	for _, host := range append([]string{c.StoreRoot, domain.DefaultStoreRoot, c.Target}, c.PlatformHosts...) {
		own := BareDomain(hostOnly(host))
		if own != "" && (bare == own || strings.HasSuffix(bare, "."+own)) {
			return kernel.Invalid{Reason: "This address belongs to the platform. Use a domain you own."}
		}
	}
	return nil
}

// NewDomainToken is a fresh ownership token for a TXT record.
func NewDomainToken() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return "wit-verify-" + hex.EncodeToString(b)
}

// DomainRecord is one DNS record the brand adds and, after a check, what DNS answered for it.
type DomainRecord struct {
	Type  string `json:"type"`
	Name  string `json:"name"`
	Value string `json:"value"`
	// Found is what DNS answered for the name, and OK whether it holds the value. Only a check fills them.
	Found []string `json:"found,omitempty"`
	OK    *bool    `json:"ok,omitempty"`
}

// DomainStatus is a custom domain as the console shows it: the records to add and, after a check,
// how each one did.
type DomainStatus struct {
	Domain     *string        `json:"domain"`
	Verified   bool           `json:"verified"`
	VerifiedAt string         `json:"verifiedAt,omitempty"`
	Records    []DomainRecord `json:"records"`
	// Owned is the TXT record proving ownership, and Pointed the domain reaching the store by CNAME
	// or by A records. Only a check fills them.
	Owned   *bool `json:"owned,omitempty"`
	Pointed *bool `json:"pointed,omitempty"`
	// Detail says what to fix after a failed check.
	Detail string `json:"detail,omitempty"`
}

// storeHost is the tenant's host under the root, without the port a development root carries.
func (c DomainConfig) storeHost(t domain.Tenant) string {
	return t.Subdomain + "." + hostOnly(c.StoreRoot)
}

// status lists the records a tenant's domain needs, before any check.
func (c DomainConfig) status(t domain.Tenant) DomainStatus {
	out := DomainStatus{Domain: t.Domain, Records: []DomainRecord{}}
	if t.Domain == nil || *t.Domain == "" {
		return out
	}
	name := *t.Domain
	out.Verified = t.CustomDomain() != ""
	if out.Verified {
		out.VerifiedAt = t.DomainVerifiedAt
	}
	out.Records = append(out.Records,
		DomainRecord{Type: "TXT", Name: DomainTXTLabel + "." + name, Value: t.DomainToken},
		DomainRecord{Type: "CNAME", Name: name, Value: c.cnameTargets(t)[0]},
	)
	for _, ip := range c.TargetIPs {
		out.Records = append(out.Records, DomainRecord{Type: "A", Name: name, Value: ip})
	}
	return out
}

// cnameTargets are the names a domain's CNAME may point at. The first is the one the console shows.
func (c DomainConfig) cnameTargets(t domain.Tenant) []string {
	targets := []string{c.storeHost(t)}
	if target := hostOnly(c.Target); target != "" {
		targets = []string{target, c.storeHost(t)}
	}
	return targets
}

// check asks DNS for the tenant's records. It never touches the database.
func (c DomainConfig) check(ctx context.Context, t domain.Tenant) DomainStatus {
	out := c.status(t)
	if t.Domain == nil || *t.Domain == "" {
		return out
	}
	name := *t.Domain
	ctx, cancel := context.WithTimeout(ctx, cmp.Or(c.Timeout, 5*time.Second))
	defer cancel()
	dns := c.resolver()

	txt, _ := dns.LookupTXT(ctx, DomainTXTLabel+"."+name)
	for i := range txt {
		txt[i] = strings.TrimSpace(txt[i])
	}
	owned := t.DomainToken != "" && slices.Contains(txt, t.DomainToken)

	var cname []string
	if canonical, err := dns.LookupCNAME(ctx, name); err == nil {
		// A name without a CNAME answers with itself.
		if canonical = hostOnly(canonical); canonical != "" && canonical != name {
			cname = []string{canonical}
		}
	}
	byCNAME := len(cname) > 0 && slices.Contains(c.cnameTargets(t), cname[0])

	var addrs []string
	byA := false
	if !byCNAME && len(c.TargetIPs) > 0 {
		addrs, _ = dns.LookupHost(ctx, name)
		byA = len(addrs) > 0 && !slices.ContainsFunc(addrs, func(a string) bool { return !c.isTargetIP(a) })
	}
	pointed := byCNAME || byA

	for i, r := range out.Records {
		switch r.Type {
		case "TXT":
			out.Records[i].Found, out.Records[i].OK = txt, kernel.Ptr(owned)
		case "CNAME":
			out.Records[i].Found, out.Records[i].OK = cname, kernel.Ptr(byCNAME)
		case "A":
			out.Records[i].Found, out.Records[i].OK = addrs, kernel.Ptr(slices.ContainsFunc(addrs, func(a string) bool { return sameIP(a, r.Value) }))
		}
	}
	out.Owned, out.Pointed = &owned, &pointed
	switch {
	case owned && pointed:
	case ctx.Err() != nil:
		out.Detail = "DNS did not answer in time. Try again in a minute."
	case !owned && len(txt) == 0:
		out.Detail = "The TXT record is not there yet. DNS changes can take up to a day to show."
	case !owned:
		out.Detail = "The TXT record holds another value. Copy the value again and replace it."
	case len(addrs) > 0 && !byA && len(cname) == 0:
		out.Detail = "The domain points at another server. Remove the old A records, then add the ones listed here."
	case len(cname) > 0:
		out.Detail = "The domain points at " + cname[0] + ". Change the CNAME record to the value listed here."
	default:
		out.Detail = "The domain does not point at your store yet. Add the CNAME record listed here."
	}
	return out
}

func (c DomainConfig) isTargetIP(addr string) bool {
	return slices.ContainsFunc(c.TargetIPs, func(target string) bool { return sameIP(addr, target) })
}

// sameIP compares two addresses however they are written.
func sameIP(a, b string) bool {
	x, y := net.ParseIP(strings.TrimSpace(a)), net.ParseIP(strings.TrimSpace(b))
	return x != nil && y != nil && x.Equal(y)
}

// clearDomainProof drops everything a check wrote, for a domain that changed or left.
func clearDomainProof(t *domain.Tenant) {
	t.DomainVerified = false
	t.DomainToken, t.DomainVerifiedAt, t.DomainCheckedAt, t.DomainCheckFailures = "", "", "", 0
}

// SetDomain is tenants/setDomain: connect a custom domain, or disconnect it with nil. A new domain
// starts unverified with the token its TXT record must hold. The HTTP layer issues the token.
func (s *Identity) SetDomain(ctx context.Context, m kernel.Meta, tenantID string, name *string, token string) (*kernel.Delta, error) {
	if err := kernel.Access(m, tenantID); err != nil {
		return nil, err
	}
	if name != nil {
		if s.Domains.StoreRoot == "" {
			return nil, kernel.Refuse("Custom domains need store addresses. Ask the platform team to set STORE_ROOT_DOMAIN.")
		}
		if err := s.Domains.ValidDomain(*name); err != nil {
			return nil, err
		}
		if token == "" {
			return nil, kernel.Invalid{Reason: "A domain needs a verification token."}
		}
	}
	return s.Run(ctx, func(t *kernel.Tx) error {
		tenant, err := kernel.Lock[domain.Tenant](t, "tenants", tenantID, "tenant")
		if err != nil {
			return err
		}
		// Saving the domain the brand already has keeps its verification. One from before
		// verification existed has no token yet and gets one.
		if (name == nil && tenant.Domain == nil) || (name != nil && tenant.Domain != nil && *name == *tenant.Domain && tenant.DomainToken != "") {
			return nil
		}
		if name != nil {
			var taken bool
			if err := t.QueryRow(t.Ctx, `select exists (select 1 from tenants where domain = $1 and id <> $2)`, BareDomain(*name), tenantID).Scan(&taken); err != nil {
				return err
			}
			if taken {
				return ErrDomainTaken
			}
		}
		clearDomainProof(&tenant)
		tenant.Domain = name
		if name != nil {
			tenant.DomainToken = token
		}
		return t.Put("tenants", tenant.ID, tenant)
	})
}

// DomainStatusOf lists the DNS records a tenant's domain needs, without asking DNS.
func (s *Identity) DomainStatusOf(ctx context.Context, m kernel.Meta, tenantID string) (DomainStatus, error) {
	if err := kernel.Access(m, tenantID); err != nil {
		return DomainStatus{}, err
	}
	tenant, err := s.tenantByID(ctx, tenantID)
	if err != nil {
		return DomainStatus{}, err
	}
	return s.Domains.status(tenant), nil
}

// VerifyDomain is tenants/verifyDomain: ask DNS for the TXT record and where the domain points, and
// mark the domain verified when both are right. The answer says how each record did either way.
func (s *Identity) VerifyDomain(ctx context.Context, m kernel.Meta, tenantID string) (DomainStatus, *kernel.Delta, error) {
	if err := kernel.Access(m, tenantID); err != nil {
		return DomainStatus{}, nil, err
	}
	tenant, err := s.tenantByID(ctx, tenantID)
	if err != nil {
		return DomainStatus{}, nil, err
	}
	if tenant.Domain == nil || *tenant.Domain == "" || tenant.DomainToken == "" {
		return DomainStatus{}, nil, kernel.Refuse("Connect a domain first.")
	}
	// DNS is asked outside the transaction, so a slow resolver holds no row lock.
	status := s.Domains.check(ctx, tenant)
	if !*status.Owned || !*status.Pointed {
		return status, kernel.NewDelta(), nil
	}
	d, err := s.Run(ctx, func(t *kernel.Tx) error {
		now, err := kernel.Lock[domain.Tenant](t, "tenants", tenant.ID, "tenant")
		if err != nil {
			return err
		}
		if domainChanged(now, tenant) {
			return kernel.Refuse("The domain changed during the check. Check again.")
		}
		now.DomainVerified = true
		if now.DomainVerifiedAt == "" {
			now.DomainVerifiedAt = m.At
		}
		now.DomainCheckedAt, now.DomainCheckFailures = m.At, 0
		status.Verified, status.VerifiedAt = true, now.DomainVerifiedAt
		return t.Put("tenants", now.ID, now)
	})
	return status, d, err
}

// domainChanged reports whether the tenant's domain or token moved while DNS was being asked.
func domainChanged(now, checked domain.Tenant) bool {
	return now.Domain == nil || *now.Domain != *checked.Domain || now.DomainToken != checked.DomainToken
}

func (s *Identity) tenantByID(ctx context.Context, id string) (domain.Tenant, error) {
	tenant, err := store.Get[domain.Tenant](ctx, s.DB.Pool, "tenants", id)
	if errors.Is(err, store.ErrNotFound) {
		return tenant, kernel.NotFound{What: "tenant"}
	}
	return tenant, err
}

// RecheckDomains asks DNS again for verified domains whose last check is a day old. A domain that
// fails DomainMaxFailures checks in a row stops being verified, so one that moved away is no longer
// served. It keeps its token, and a manual check brings it back.
func (s *Identity) RecheckDomains(ctx context.Context, at string) (*kernel.Delta, error) {
	var due []domain.Tenant
	_, err := s.Run(ctx, func(t *kernel.Tx) error {
		rows, err := t.Query(t.Ctx, `select data from tenants
			where domain is not null and data->>'domainVerified' = 'true' and data->>'domainVerifiedAt' is not null
			order by data->>'domainCheckedAt' nulls first`)
		if err != nil {
			return err
		}
		verified, err := pgx.CollectRows(rows, pgx.RowTo[domain.Tenant])
		if err != nil {
			return err
		}
		for _, tenant := range verified {
			if tenant.DomainCheckedAt != "" && clock.Ms(at)-clock.Ms(tenant.DomainCheckedAt) < domainRecheckEvery {
				continue
			}
			if due = append(due, tenant); len(due) == domainRecheckBatch {
				break
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	total := kernel.NewDelta()
	for _, tenant := range due {
		status := s.Domains.check(ctx, tenant)
		d, err := s.Run(ctx, func(t *kernel.Tx) error {
			now, err := kernel.Lock[domain.Tenant](t, "tenants", tenant.ID, "tenant")
			if err != nil {
				return err
			}
			if now.CustomDomain() == "" || domainChanged(now, tenant) {
				return nil
			}
			now.DomainCheckedAt = at
			if *status.Owned && *status.Pointed {
				now.DomainCheckFailures = 0
			} else if now.DomainCheckFailures++; now.DomainCheckFailures >= DomainMaxFailures {
				now.DomainVerified, now.DomainVerifiedAt = false, ""
			}
			return t.Put("tenants", now.ID, now)
		})
		if err != nil {
			return nil, err
		}
		for collection, rows := range d.Upserts {
			total.Upserts[collection] = append(total.Upserts[collection], rows...)
		}
	}
	return total, nil
}

// StoreByDomain is the subdomain of the store a verified custom domain serves, with or without
// www. An unverified or unknown domain answers false.
func (s *Identity) StoreByDomain(ctx context.Context, host string) (string, bool, error) {
	var subdomain string
	err := s.DB.Pool.QueryRow(ctx, `select subdomain from tenants
		where domain = $1 and data->>'domainVerified' = 'true' and data->>'domainVerifiedAt' is not null`,
		BareDomain(hostOnly(host))).Scan(&subdomain)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	return subdomain, err == nil, err
}
