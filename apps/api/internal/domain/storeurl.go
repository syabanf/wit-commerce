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

// StoreLink is where links to a brand's store point: its own host under root, plain http for a
// localhost root in development. With no root every store lives on one host at publicURL/shop/{subdomain}.
func StoreLink(t Tenant, root, publicURL string) string {
	if root == "" {
		return publicURL + "/shop/" + t.Subdomain
	}
	return StoreURL(t, root, !strings.Contains(root, "localhost"))
}
