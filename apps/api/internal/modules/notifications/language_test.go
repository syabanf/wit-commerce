package notifications

import (
	"strings"
	"testing"
)

func TestEveryLanguageHasEveryPhrase(t *testing.T) {
	for lang, words := range phrases {
		for key := range phrases["en"] {
			if words[key] == "" {
				t.Errorf("%s lacks %q", lang, key)
			}
		}
		for key := range words {
			if _, ok := phrases["en"][key]; !ok {
				t.Errorf("%s has %q, which English lacks", lang, key)
			}
		}
	}
}

func TestShopperEmailSpeaksTheStoreLanguage(t *testing.T) {
	facts := ShopperFacts{Brand: StoreBranding(lari(), "", ""), To: "a@example.com", OrderCode: "LARI-1", OrderURL: "https://x", Total: 125_000, AwaitingPayment: true, PayOnline: true}
	facts.Lang = "id"
	m, _ := ComposeShopper("order_placed", facts)
	if m.Subject != "Pesanan LARI-1 di Lari & Co" || !strings.Contains(m.Text, "Halo Kak,") || !strings.Contains(m.Text, "Bayar sekarang") {
		t.Errorf("Indonesian email: %q\n%s", m.Subject, m.Text)
	}
	facts.Lang = "en"
	if m, _ := ComposeShopper("order_placed", facts); m.Subject != "Your Lari & Co order LARI-1" || !strings.Contains(m.Text, "Hi there,") {
		t.Errorf("English email: %q\n%s", m.Subject, m.Text)
	}
}

func TestMissingPhraseFallsBackToEnglish(t *testing.T) {
	saved := phrases["id"]["shipped.title"]
	delete(phrases["id"], "shipped.title")
	t.Cleanup(func() { phrases["id"]["shipped.title"] = saved })
	m, _ := ComposeShopper("order_shipped", ShopperFacts{Brand: PlatformBranding(""), OrderCode: "X-1", OrderURL: "https://x", Courier: "JNE", Lang: "id"})
	if !strings.Contains(m.Text, "Your order is on its way") || !strings.Contains(m.Text, "Kurir: JNE") {
		t.Errorf("fallback: %s", m.Text)
	}
	if got := Say("fr", "label.total"); got != "Total" {
		t.Errorf("an unknown language: %q", got)
	}
}

func TestMarketingEmailInIndonesian(t *testing.T) {
	m := ComposeMarketing(Branding{Name: "Lari", Color: "#ED1C24"}, "id", "rina@example.com", Email{Title: "Sepatu baru"}, "https://x/unsubscribe?token=a")
	if !strings.Contains(m.Text, "Berhenti berlangganan: https://x/unsubscribe?token=a") || !strings.Contains(m.Text, "penawaran dan kabar dari Lari") {
		t.Errorf("marketing: %s", m.Text)
	}
}
