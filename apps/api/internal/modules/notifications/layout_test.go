package notifications

import (
	"flag"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

var update = flag.Bool("update", false, "rewrite the email snapshots in testdata")

// snapshot compares a rendered email with testdata/<name>; go test -update rewrites it.
func snapshot(t *testing.T, name, got string) {
	t.Helper()
	path := filepath.Join("testdata", name)
	if *update {
		if err := os.MkdirAll("testdata", 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(got), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%v; run go test -update to write it", err)
	}
	if string(want) != got {
		t.Errorf("%s changed; run go test -update if that was meant\n got: %s", name, got)
	}
}

func lari() domain.Tenant {
	logo := "/media/lari/logo.png"
	return domain.Tenant{
		ID: "ten-lari", Name: "Lari & Co", Subdomain: "lari",
		Brand: domain.BrandConfig{Colors: domain.BrandColors{Primary: "#1f3a2e"}, LogoURL: &logo},
	}
}

func TestStoreEmailSnapshot(t *testing.T) {
	brand := StoreBranding(lari(), "https://lari.commerce.reddie.id", "https://commerce.reddie.id")
	m, ok := ComposeShopper("order_placed", ShopperFacts{
		Brand: brand, To: "rina@example.com", CustomerName: "Rina Wijaya", OrderCode: "LARI-10042",
		OrderURL: "https://lari.commerce.reddie.id/order/ord-1",
		Lines:    []Line{{Name: "Trail Runner", Detail: "42 · Qty 2", Amount: Rupiah(1_250_000)}, {Name: "Socks <3 pack>", Detail: "Qty 1", Amount: Rupiah(89_000)}},
		Subtotal: 1_339_000, Discount: 50_000, Shipping: 0, Total: 1_289_000, AwaitingPayment: true, PayOnline: true,
	})
	if !ok {
		t.Fatal("order_placed did not compose")
	}
	if m.Subject != "Your Lari & Co order LARI-10042" {
		t.Errorf("subject %q", m.Subject)
	}
	for _, want := range []string{"#1f3a2e", "https://commerce.reddie.id/media/lari/logo.png", "Socks &lt;3 pack&gt;", "Pay now", "Rp 1.289.000", "max-width:600px"} {
		if !strings.Contains(m.HTML, want) {
			t.Errorf("the HTML lacks %q", want)
		}
	}
	if strings.Contains(m.Text, "<td") || strings.Contains(m.Text, "&lt;") {
		t.Error("the plain-text part carries markup")
	}
	snapshot(t, "order_placed.html", m.HTML)
	snapshot(t, "order_placed.txt", m.Text)
}

func TestPlatformEmailSnapshot(t *testing.T) {
	m := linkMessage(PlatformBranding("https://commerce.reddie.id"), "budi@example.com", "You are invited to WIT Commerce",
		"An admin added you to WIT Commerce. Use this link within 7 days to choose your password.", "Choose your password",
		"https://commerce.reddie.id/reset-password?token=abc&invite=1")
	for _, want := range []string{"WIT Commerce", platformColor, "token=abc&amp;invite=1"} {
		if !strings.Contains(m.HTML, want) {
			t.Errorf("the HTML lacks %q", want)
		}
	}
	if !strings.Contains(m.Text, "https://commerce.reddie.id/reset-password?token=abc&invite=1") {
		t.Error("the plain-text part lacks the working link")
	}
	snapshot(t, "staff_invite.html", m.HTML)
	snapshot(t, "staff_invite.txt", m.Text)
}

func TestEveryShopperKindComposes(t *testing.T) {
	facts := ShopperFacts{Brand: PlatformBranding(""), To: "a@example.com", OrderCode: "X-1", OrderURL: "https://x", ReturnCode: "X-R0001", Amount: 1000, Courier: "JNE", TrackingNo: "JNE123"}
	for _, kind := range []string{"order_placed", "payment_received", "order_shipped", "order_cancelled", "order_refunded", "return_approved", "return_refunded"} {
		m, ok := ComposeShopper(kind, facts)
		if !ok || m.Subject == "" || !strings.Contains(m.Text, "https://x") {
			t.Errorf("%s: %v %q", kind, ok, m.Subject)
		}
	}
	if m, _ := ComposeShopper("order_shipped", facts); !strings.Contains(m.Text, "JNE123") {
		t.Error("the shipped email lacks the tracking number")
	}
	if _, ok := ComposeShopper("unknown", facts); ok {
		t.Error("an unknown kind composed")
	}
	// A logo that is not a web address is left out rather than sent broken.
	bad := "javascript:alert(1)"
	tenant := lari()
	tenant.Brand.LogoURL = &bad
	tenant.Brand.Colors.Primary = "red; background:url(x)"
	if b := StoreBranding(tenant, "", ""); b.LogoURL != "" || b.Color != platformColor {
		t.Errorf("unsafe branding passed through: %+v", b)
	}
}
