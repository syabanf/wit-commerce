package notifications

import (
	"strings"
	"testing"
)

func TestEveryMarketingEmailCarriesItsUnsubscribeLink(t *testing.T) {
	n := &Notifications{PublicURL: "https://shop.example.com"}
	link := n.UnsubscribeURL("abc.def")
	if link != "https://shop.example.com/api/v1/unsubscribe?token=abc.def" {
		t.Fatalf("link: %s", link)
	}
	m := ComposeMarketing(Branding{Name: "Lari", Color: "#ED1C24"}, "en", "rina@example.com", Email{Title: "New trail shoes", Intro: "Fresh stock."}, link)
	for part, body := range map[string]string{"html": m.HTML, "text": m.Text} {
		if !strings.Contains(body, "unsubscribe?token=abc.def") || !strings.Contains(body, "Unsubscribe") {
			t.Errorf("%s has no unsubscribe link", part)
		}
	}
	if m.To != "rina@example.com" || m.Subject != "New trail shoes" || !strings.Contains(m.Text, "agreed to offers and news from Lari") {
		t.Errorf("message: %+v", m)
	}
}
