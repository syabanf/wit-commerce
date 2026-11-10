package identity

import "testing"

func TestValidSubdomain(t *testing.T) {
	for _, name := range []string{"lari", "kopi-senja", "a1b", "toko-123", "abcdefghijklmnopqrstuvwxyz1234"} {
		if err := ValidSubdomain(name); err != nil {
			t.Errorf("%q: %v", name, err)
		}
	}
	for _, name := range []string{"", "ab", "-lari", "lari-", "Lari", "kopi senja", "kopi_senja", "abcdefghijklmnopqrstuvwxyz12345",
		"www", "api", "admin", "shop", "store", "media", "signup", "start", "login", "staging"} {
		if ValidSubdomain(name) == nil {
			t.Errorf("%q should be refused", name)
		}
	}
}

func TestSuggestionsAreValid(t *testing.T) {
	for _, name := range []string{"lari", "Kopi Senja!", "x", "", "a-very-long-store-name-that-goes-on-and-on"} {
		got := suggestionsFor(name)
		if len(got) < 3 {
			t.Errorf("%q: only %v", name, got)
		}
		for _, s := range got {
			if err := ValidSubdomain(s); err != nil {
				t.Errorf("%q suggests %q: %v", name, s, err)
			}
		}
	}
}
