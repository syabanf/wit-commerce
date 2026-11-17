package domain

import "strings"

// DefaultStoreRoot is the parent domain of store hosts when STORE_ROOT_DOMAIN is unset.
const DefaultStoreRoot = "commerce.reddie.id"

// StoreURL is a brand's store address under the root domain: https://lari.commerce.reddie.id, or
// http:// when secure is false.
func StoreURL(t Tenant, root string, secure bool) string {
	scheme := "https://"
	if !secure {
		scheme = "http://"
	}
	return scheme + t.Subdomain + "." + root
}

// CustomDomain is the brand's own domain once DNS proved it is theirs, else empty. A domain without
// a verified time (the seeded ones) was never checked, so it is not served or linked to.
func (t Tenant) CustomDomain() string {
	if t.Domain == nil || !t.DomainVerified || t.DomainVerifiedAt == "" {
		return ""
	}
	return *t.Domain
}

// StoreLink is where links to a brand's store point: its verified custom domain, else its own host
// under root, plain http for a localhost root in development. With no root every store lives on one
// host at publicURL/shop/{subdomain}.
func StoreLink(t Tenant, root, publicURL string) string {
	if custom := t.CustomDomain(); custom != "" {
		return "https://" + custom
	}
	if root == "" {
		return publicURL + "/shop/" + t.Subdomain
	}
	return StoreURL(t, root, !strings.Contains(root, "localhost"))
}
