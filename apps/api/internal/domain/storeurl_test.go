package domain

import "testing"

func TestStoreLink(t *testing.T) {
	lari := Tenant{Subdomain: "lari"}
	cases := []struct{ root, public, want string }{
		{"commerce.reddie.id", "https://commerce.reddie.id", "https://lari.commerce.reddie.id"},
		{"localhost:5375", "", "http://lari.localhost:5375"},
		{"", "https://shop.example.com", "https://shop.example.com/shop/lari"},
	}
	for _, c := range cases {
		if got := StoreLink(lari, c.root, c.public); got != c.want {
			t.Errorf("StoreLink(%q, %q) = %q, want %q", c.root, c.public, got, c.want)
		}
	}
	if got := StoreURL(lari, "example.com", false); got != "http://lari.example.com" {
		t.Errorf("StoreURL insecure = %q", got)
	}
}

func TestStoreLinkPrefersTheVerifiedDomain(t *testing.T) {
	custom := "www.tokosaya.com"
	lari := Tenant{Subdomain: "lari", Domain: &custom}
	if got := StoreLink(lari, "commerce.reddie.id", ""); got != "https://lari.commerce.reddie.id" {
		t.Errorf("unverified domain linked: %q", got)
	}
	// The seed marks domains verified without a check; only a verified time counts.
	lari.DomainVerified = true
	if got := StoreLink(lari, "commerce.reddie.id", ""); got != "https://lari.commerce.reddie.id" {
		t.Errorf("never checked domain linked: %q", got)
	}
	lari.DomainVerifiedAt = "2026-10-05T09:41:00+07:00"
	for _, root := range []string{"commerce.reddie.id", "localhost:5375", ""} {
		if got := StoreLink(lari, root, "https://shop.example.com"); got != "https://www.tokosaya.com" {
			t.Errorf("root %q: %q, want the custom domain", root, got)
		}
	}
}
