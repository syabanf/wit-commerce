package identity

import (
	"context"
	"regexp"
	"slices"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
)

var subdomainPattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$`)

// reservedSubdomains name the platform's own hosts and pages, so no store can take them.
var reservedSubdomains = []string{
	"www", "api", "admin", "app", "shop", "store", "mail", "media", "static", "cdn", "help", "support",
	"status", "blog", "docs", "dev", "staging", "test", "signup", "start", "login",
}

// Conflicts the clients act on by code.
var (
	ErrSubdomainTaken = kernel.Conflict{Code: "SUBDOMAIN_TAKEN", Reason: "This address is taken. Pick another one."}
	ErrTenantExists   = kernel.Conflict{Code: "TENANT_EXISTS", Reason: "A tenant with this id already exists."}
)

// ValidSubdomain checks the shape and the reserved names.
func ValidSubdomain(name string) error {
	if !subdomainPattern.MatchString(name) {
		return kernel.Invalid{Reason: "Use 3 to 30 lowercase letters, numbers or dashes, starting and ending with a letter or number."}
	}
	if slices.Contains(reservedSubdomains, name) {
		return kernel.Invalid{Reason: "This address is reserved. Pick another one."}
	}
	return nil
}

// SubdomainTaken reports whether a store already uses the name.
func SubdomainTaken(t *kernel.Tx, name string) (bool, error) {
	var taken bool
	err := t.QueryRow(t.Ctx, `select exists (select 1 from tenants where subdomain = $1)`, name).Scan(&taken)
	return taken, err
}

// TenantExists reports whether a tenant has the id.
func TenantExists(t *kernel.Tx, id string) (bool, error) {
	var found bool
	err := t.QueryRow(t.Ctx, `select exists (select 1 from tenants where id = $1)`, id).Scan(&found)
	return found, err
}

// SubdomainCheck answers the sign-up page's live check.
type SubdomainCheck struct {
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"`
	// Suggestions are free names close to the one asked for, when it is not available.
	Suggestions []string `json:"suggestions"`
}

// CheckSubdomain says whether a name is free and, when it is not, offers three that are.
func (s *Identity) CheckSubdomain(ctx context.Context, name string) (SubdomainCheck, error) {
	out := SubdomainCheck{Suggestions: []string{}}
	_, err := s.Run(ctx, func(t *kernel.Tx) error {
		if err := ValidSubdomain(name); err != nil {
			out.Reason = err.Error()
		} else if taken, err := SubdomainTaken(t, name); err != nil {
			return err
		} else if taken {
			out.Reason = ErrSubdomainTaken.Reason
		} else {
			out.Available = true
			return nil
		}
		candidates := suggestionsFor(name)
		rows, err := t.Query(t.Ctx, `select subdomain from tenants where subdomain = any($1)`, candidates)
		if err != nil {
			return err
		}
		defer rows.Close()
		used := map[string]bool{}
		for rows.Next() {
			var sub string
			if err := rows.Scan(&sub); err != nil {
				return err
			}
			used[sub] = true
		}
		for _, c := range candidates {
			if !used[c] && len(out.Suggestions) < 3 {
				out.Suggestions = append(out.Suggestions, c)
			}
		}
		return rows.Err()
	})
	return out, err
}

var notSlug = regexp.MustCompile(`[^a-z0-9]+`)

// suggestionsFor turns any input into a valid base and lists names built from it, in order of preference.
func suggestionsFor(name string) []string {
	base := strings.Trim(notSlug.ReplaceAllString(strings.ToLower(name), "-"), "-")
	if len(base) > 22 {
		base = strings.TrimRight(base[:22], "-")
	}
	if len(base) < 2 {
		base = strings.Trim("my-"+base, "-")
	}
	var out []string
	for _, suffix := range []string{"-shop", "-id", "-official", "-co", "2", "3", "4", "5", "-hq", "-online"} {
		if c := base + suffix; ValidSubdomain(c) == nil {
			out = append(out, c)
		}
	}
	return out
}
