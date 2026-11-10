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
