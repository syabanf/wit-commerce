package notifications

import (
	"strings"
	"testing"
)

func TestOrderEmailShowsPPNForAPKP(t *testing.T) {
	base := ShopperFacts{
		Brand: StoreBranding(lari(), "https://lari.commerce.reddie.id", "https://commerce.reddie.id"), To: "rina@example.com",
		CustomerName: "Rina", OrderCode: "LARI-10042", OrderURL: "https://lari.commerce.reddie.id/order/ord-1",
		Subtotal: 1_000_000, Shipping: 18_000, Total: 1_128_000, Lang: "id",
	}
	added := base
	added.Tax = &TaxFacts{DPP: 916_667, PPN: 110_000, Rate: "12"}
	m, _ := ComposeShopper("order_placed", added)
	for _, want := range []string{"Dasar pengenaan pajak (DPP)", "Rp 916.667", "PPN 12%", "Rp 110.000"} {
		if !strings.Contains(m.Text, want) {
			t.Errorf("PPN added: the email lacks %q", want)
		}
	}
	included := base
	included.Total, included.Lang = 1_018_000, "en"
	included.Tax = &TaxFacts{DPP: 825_826, PPN: 99_099, Rate: "12", Included: true}
	m, _ = ComposeShopper("order_placed", included)
	if !strings.Contains(m.Text, "Includes PPN 12%") || !strings.Contains(m.Text, "Rp 99.099") {
		t.Errorf("PPN included: %s", m.Text)
	}
	m, _ = ComposeShopper("order_placed", base)
	if strings.Contains(m.Text, "PPN") || strings.Contains(m.Text, "DPP") {
		t.Error("a brand that is not PKP shows tax rows")
	}
}
