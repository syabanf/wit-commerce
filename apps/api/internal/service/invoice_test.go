package service_test

import (
	"bytes"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/notifications"
	"github.com/syabanf/wit-commerce/apps/api/internal/pdf"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

var updateGolden = flag.Bool("update", false, "rewrite the golden files")

// taxedInvoice is an order of 40 lines with PPN added at checkout, long enough for three pages.
func taxedInvoice(lang string, includes bool) service.InvoiceInput {
	in := service.InvoiceInput{
		Lang: lang, Number: "INV/LARI/2026/10/0007", IssuedAt: clock.MustParse("2026-10-06T10:00:00+07:00"),
		OrderCode: "LARI-90001", OrderedAt: clock.MustParse("2026-10-05T09:41:00+07:00"),
		SellerName: "PT Lari Nusantara", SellerAddress: "Jl. Senopati 10, Kebayoran Baru, Jakarta Selatan",
		SellerNPWP: "01.234.567.8-901.000", SellerNIB: "1234567890123", SellerContact: "+62 21 555 0101 · help@lari.co.id",
		BuyerName: "Rina Wijaya", BuyerContact: "rina@example.com · 0812 3456 7890", BuyerCity: "Bandung",
		Discount: 25_000, Shipping: 18_000, PaymentStatus: "paid",
	}
	var lines []domain.OrderLine
	for i := range 40 {
		lines = append(lines, domain.OrderLine{ProductID: fmt.Sprint("p", i), Qty: 1 + i%3, Price: 49_999 + i*1_000})
	}
	tax := rules.ComputeOrderTax(lines, in.Discount, domain.TaxSettings{PKP: true, PricesIncludeTax: includes, Profile: "standard"}, func(string) string { return "" })
	in.Tax = &tax
	for i, l := range lines {
		in.Subtotal += l.Qty * l.Price
		in.Lines = append(in.Lines, service.InvoiceLine{
			Name: fmt.Sprintf("Sepatu Lari Nusantara Road %02d · 42 / Hitam + Kaus kaki", i+1), Qty: l.Qty, Unit: l.Price,
			Amount: l.Qty * l.Price, DPP: tax.Lines[i].DPP, PPN: tax.Lines[i].PPN,
		})
	}
	in.Total = in.Subtotal - in.Discount + in.Shipping + rules.AddedTax(&tax)
	return in
}

func TestInvoicePDF(t *testing.T) {
	in := taxedInvoice("id", false)
	out := service.RenderInvoice(in)
	info, err := pdf.Inspect(out)
	if err != nil {
		t.Fatal(err)
	}
	if info.Pages != 3 {
		t.Errorf("40 wrapped lines take 3 pages, got %d", info.Pages)
	}
	all := slices.Concat(info.Text...)
	for _, want := range []string{
		"INVOICE", "INV/LARI/2026/10/0007", "PT Lari Nusantara", "NPWP 01.234.567.8-901.000", "Rina Wijaya", "Bandung",
		"Dasar pengenaan pajak (DPP)", notifications.Rupiah(in.Tax.DPP), "PPN 12%", notifications.Rupiah(in.Tax.PPN),
		notifications.Rupiah(in.Total), notifications.Rupiah(-in.Discount), "Lunas", "Halaman 1 dari 3", "Halaman 3 dari 3",
	} {
		if !slices.Contains(all, want) {
			t.Errorf("the invoice does not say %q", want)
		}
	}
	if !slices.ContainsFunc(all, func(s string) bool { return strings.Contains(s, "bukan Faktur Pajak") }) {
		t.Error("the invoice must say it is not a Faktur Pajak")
	}
	// The table header repeats on the second page.
	if !slices.Contains(info.Text[1], "Harga satuan") {
		t.Error("no table header on page 2")
	}
	golden(t, "invoice_taxed.pdf", out)
}

func TestInvoicePDFWithPricesIncludingPPN(t *testing.T) {
	in := taxedInvoice("en", true)
	in.Lines = in.Lines[:2]
	info, err := pdf.Inspect(service.RenderInvoice(in))
	if err != nil {
		t.Fatal(err)
	}
	all := slices.Concat(info.Text...)
	if info.Pages != 1 || !slices.Contains(all, "Prices include PPN 12%") || slices.Contains(all, "PPN 12%") {
		t.Errorf("pages %d, text %q", info.Pages, all)
	}
}

func TestInvoicePDFForABrandThatIsNotPKP(t *testing.T) {
	in := taxedInvoice("en", false)
	in.Tax, in.SellerNPWP, in.Lines = nil, "", in.Lines[:1]
	info, err := pdf.Inspect(service.RenderInvoice(in))
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range slices.Concat(info.Text...) {
		if strings.Contains(s, "PPN") || strings.Contains(s, "DPP") || strings.Contains(s, "NPWP") {
			t.Errorf("an invoice without tax says %q", s)
		}
	}
}

func golden(t *testing.T, name string, got []byte) {
	t.Helper()
	path := filepath.Join("testdata", name)
	if *updateGolden {
		if err := os.WriteFile(path, got, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%v (run go test -update once)", err)
	}
	if !bytes.Equal(got, want) {
		t.Errorf("%s changed; inspect it and rerun with -update if it is right", name)
	}
}
