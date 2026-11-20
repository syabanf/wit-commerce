package service

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/notifications"
	"github.com/syabanf/wit-commerce/apps/api/internal/pdf"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// An order's invoice joins the order and its number (orders), the seller (identity), the buyer (crm)
// and the product names (catalog), so it lives in the facade. It is a commercial invoice, not a
// Faktur Pajak: e-Faktur numbers come from Coretax, which this product does not talk to.

// InvoiceLine is one row of the invoice table.
type InvoiceLine struct {
	Name   string
	Qty    int
	Unit   int
	Amount int
	DPP    int
	PPN    int
}

// InvoiceInput is everything an invoice shows.
type InvoiceInput struct {
	Lang          string
	Number        string
	IssuedAt      time.Time
	OrderCode     string
	OrderedAt     time.Time
	SellerName    string
	SellerAddress string
	SellerNPWP    string
	SellerNIB     string
	SellerContact string
	BuyerName     string
	BuyerContact  string
	BuyerCity     string
	Lines         []InvoiceLine
	Subtotal      int
	Discount      int
	Shipping      int
	Total         int
	Tax           *domain.OrderTax
	PaymentStatus string
	Refunded      int
}

// InvoicePDF issues the order's invoice number if it has none and renders the invoice.
func (s *Service) InvoicePDF(ctx context.Context, m Meta, orderID string) ([]byte, string, error) {
	inv, o, err := s.Orders.InvoiceFor(ctx, m, orderID)
	if err != nil {
		return nil, "", err
	}
	pool := s.DB.Pool
	tenant, err := store.Get[domain.Tenant](ctx, pool, "tenants", o.TenantID)
	if err != nil {
		return nil, "", err
	}
	in := InvoiceInput{
		Lang: rules.StoreLanguage(tenant), Number: inv.Number, IssuedAt: inv.IssuedAt, OrderCode: o.Code,
		SellerName: tenant.Name, BuyerCity: o.City, Subtotal: o.Subtotal, Discount: o.Discount,
		Shipping: o.Shipping, Total: o.Total, Tax: o.Tax, PaymentStatus: o.PaymentStatus, Refunded: o.RefundedAmount,
	}
	in.OrderedAt, _ = clock.Parse(o.CreatedAt)
	if l := tenant.Legal; l != nil {
		if l.EntityName != "" {
			in.SellerName = l.EntityName
		}
		in.SellerAddress = strings.TrimSpace(strings.Join(nonEmpty(l.Address, l.City), ", "))
		in.SellerNIB = l.NIB
		in.SellerContact = strings.Join(nonEmpty(l.Phone, l.Email), " · ")
		// The NPWP shows for a PKP, or on an order a PKP taxed.
		if o.Tax != nil || (tenant.Tax != nil && tenant.Tax.PKP) {
			in.SellerNPWP = l.NPWP
		}
	}
	if c, err := store.Get[domain.Customer](ctx, pool, "customers", o.CustomerID); err == nil {
		in.BuyerName = c.Name
		in.BuyerContact = strings.Join(nonEmpty(c.Email, c.Phone), " · ")
	}
	for i, l := range o.Lines {
		line := InvoiceLine{Name: notifications.Say(in.Lang, "line.item"), Qty: l.Qty, Unit: l.Price, Amount: l.Qty * l.Price}
		if p, err := store.Get[domain.Product](ctx, pool, "products", l.ProductID); err == nil {
			line.Name = p.Name
			for _, v := range p.Variants {
				if v.ID == l.VariantID && v.Name != "Standard" {
					line.Name += " · " + v.Name
				}
			}
		}
		for _, mod := range l.Modifiers {
			line.Name += " + " + mod.Name
		}
		if o.Tax != nil && i < len(o.Tax.Lines) {
			line.DPP, line.PPN = o.Tax.Lines[i].DPP, o.Tax.Lines[i].PPN
		}
		in.Lines = append(in.Lines, line)
	}
	name := strings.ReplaceAll(inv.Number, "/", "-") + ".pdf"
	return RenderInvoice(in), name, nil
}

func nonEmpty(values ...string) []string {
	var out []string
	for _, v := range values {
		if v = strings.TrimSpace(v); v != "" {
			out = append(out, v)
		}
	}
	return out
}

var invoiceText = map[string]map[string]string{
	"en": {
		"title": "INVOICE", "number": "Invoice no.", "issued": "Issued", "order": "Order", "ordered": "Order date",
		"seller": "Seller", "buyer": "Bill to", "npwp": "NPWP", "nib": "NIB", "item": "Item", "qty": "Qty",
		"unit": "Unit price", "amount": "Amount", "dpp": "DPP", "ppn": "PPN", "subtotal": "Subtotal",
		"discount": "Discount", "shipping": "Shipping", "free": "Free", "total": "Total",
		"dppTotal": "Tax base (DPP)", "ppnRate": "PPN %s%%", "includes": "Prices include PPN %s%%",
		"payment": "Payment status", "refunded": "Refunded", "page": "Page %d of %d",
		"shippingNote": "Shipping is the courier's charge and carries no PPN from the seller.",
		"note":         "This invoice is not a Faktur Pajak. A PKP issues its tax invoice through the tax office's e-Faktur system.",
		"pending":      "Awaiting payment", "paid": "Paid", "failed": "Failed", "refundedStatus": "Refunded",
	},
	"id": {
		"title": "INVOICE", "number": "No. invoice", "issued": "Tanggal terbit", "order": "Pesanan", "ordered": "Tanggal pesanan",
		"seller": "Penjual", "buyer": "Ditagihkan kepada", "npwp": "NPWP", "nib": "NIB", "item": "Barang", "qty": "Jumlah",
		"unit": "Harga satuan", "amount": "Nilai", "dpp": "DPP", "ppn": "PPN", "subtotal": "Subtotal",
		"discount": "Diskon", "shipping": "Ongkos kirim", "free": "Gratis", "total": "Total",
		"dppTotal": "Dasar pengenaan pajak (DPP)", "ppnRate": "PPN %s%%", "includes": "Harga sudah termasuk PPN %s%%",
		"payment": "Status pembayaran", "refunded": "Dana dikembalikan", "page": "Halaman %d dari %d",
		"shippingNote": "Ongkos kirim adalah biaya kurir dan tidak dikenai PPN oleh penjual.",
		"note":         "Invoice ini bukan Faktur Pajak. PKP menerbitkan faktur pajaknya melalui e-Faktur Direktorat Jenderal Pajak.",
		"pending":      "Menunggu pembayaran", "paid": "Lunas", "failed": "Gagal", "refundedStatus": "Dana dikembalikan",
	},
}

var monthNames = map[string][12]string{
	"en": {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"},
	"id": {"Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"},
}

// Page geometry, in points from the top-left corner.
const (
	invLeft   = 48.0
	invRight  = pdf.PageWidth - 48
	invBottom = pdf.PageHeight - 64
	invRow    = 14.0
)

// RenderInvoice lays the invoice out on as many A4 pages as its lines need. The table header repeats
// on every page, and every page carries the number and "page n of m" at its foot.
func RenderInvoice(in InvoiceInput) []byte {
	lang := in.Lang
	if _, ok := invoiceText[lang]; !ok {
		lang = "en"
	}
	say := func(key string, args ...any) string {
		if len(args) == 0 {
			return invoiceText[lang][key]
		}
		return fmt.Sprintf(invoiceText[lang][key], args...)
	}
	date := func(t time.Time) string {
		if t.IsZero() {
			return ""
		}
		t = t.In(clock.WIB)
		return fmt.Sprintf("%d %s %d", t.Day(), monthNames[lang][t.Month()-1], t.Year())
	}
	rp := notifications.Rupiah
	doc := &pdf.Doc{Title: in.Number}
	page := doc.AddPage()

	// Seller on the left, the invoice's own facts on the right.
	page.Text(invLeft, 64, 16, true, in.SellerName)
	y := 82.0
	for _, line := range append(pdf.Wrap(in.SellerAddress, 9, false, 280), in.SellerContact) {
		if line != "" {
			page.Text(invLeft, y, 9, false, line)
			y += 12
		}
	}
	if in.SellerNPWP != "" {
		page.Text(invLeft, y, 9, false, say("npwp")+" "+in.SellerNPWP)
		y += 12
	}
	if in.SellerNIB != "" {
		page.Text(invLeft, y, 9, false, say("nib")+" "+in.SellerNIB)
		y += 12
	}
	page.TextRight(invRight, 64, 20, true, say("title"))
	facts := [][2]string{{say("number"), in.Number}, {say("issued"), date(in.IssuedAt)}, {say("order"), in.OrderCode}, {say("ordered"), date(in.OrderedAt)}}
	fy := 84.0
	for _, f := range facts {
		page.Text(350, fy, 9, false, f[0])
		page.TextRight(invRight, fy, 9, true, f[1])
		fy += 12
	}
	y = max(y, fy) + 14

	// The buyer.
	page.Text(invLeft, y, 9, true, say("buyer"))
	y += 13
	for _, line := range nonEmpty(in.BuyerName, in.BuyerContact, in.BuyerCity) {
		page.Text(invLeft, y, 9, false, line)
		y += 12
	}
	y += 14

	// The table: the item column takes what the number columns leave.
	taxed := in.Tax != nil
	type col struct {
		key   string
		right float64
	}
	cols := []col{{"qty", 330}, {"unit", 430}, {"amount", invRight}}
	itemWidth := 220.0
	if taxed {
		cols = []col{{"qty", 252}, {"unit", 320}, {"amount", 390}, {"dpp", 468}, {"ppn", invRight}}
		itemWidth = 160
	}
	header := func() {
		page.FillRect(invLeft-4, y-11, invRight-invLeft+8, 16, 0.93)
		page.Text(invLeft, y, 8.5, true, say("item"))
		for _, c := range cols {
			page.TextRight(c.right, y, 8.5, true, say(c.key))
		}
		y += 18
	}
	newPage := func() {
		page = doc.AddPage()
		y = 64
	}
	header()
	for _, l := range in.Lines {
		names := pdf.Wrap(l.Name, 9, false, itemWidth)
		if y+float64(len(names))*invRow > invBottom {
			newPage()
			header()
		}
		values := []string{strconv.Itoa(l.Qty), rp(l.Unit), rp(l.Amount)}
		if taxed {
			values = append(values, rp(l.DPP), rp(l.PPN))
		}
		for i, c := range cols {
			page.TextRight(c.right, y, 9, false, values[i])
		}
		for i, name := range names {
			page.Text(invLeft, y+float64(i)*invRow, 9, false, name)
		}
		y += float64(len(names)) * invRow
		page.Line(invLeft, y-9, invRight, y-9, 0.5, 0.85)
	}

	// Totals on the right, then payment status and the notes.
	type row struct {
		label, value string
		// bold rows are the grand total and the payment status; the total gets a rule above it.
		bold, total bool
	}
	shipping := say("free")
	if in.Shipping > 0 {
		shipping = rp(in.Shipping)
	}
	rows := []row{{label: say("subtotal"), value: rp(in.Subtotal)}}
	if in.Discount > 0 {
		rows = append(rows, row{label: say("discount"), value: rp(-in.Discount)})
	}
	var rate string
	if taxed {
		rate = strconv.FormatFloat(in.Tax.RatePct, 'f', -1, 64)
		if !in.Tax.PricesIncludeTax {
			rows = append(rows, row{label: say("dppTotal"), value: rp(in.Tax.DPP)}, row{label: say("ppnRate", rate), value: rp(in.Tax.PPN)})
		}
	}
	rows = append(rows, row{label: say("shipping"), value: shipping}, row{label: say("total"), value: rp(in.Total), bold: true, total: true})
	if taxed && in.Tax.PricesIncludeTax {
		rows = append(rows, row{label: say("includes", rate), value: rp(in.Tax.PPN)}, row{label: say("dppTotal"), value: rp(in.Tax.DPP)})
	}
	status := say(in.PaymentStatus)
	if in.PaymentStatus == "refunded" {
		status = say("refundedStatus")
	}
	if status == "" {
		status = in.PaymentStatus
	}
	rows = append(rows, row{label: say("payment"), value: status, bold: true})
	if in.Refunded > 0 {
		rows = append(rows, row{label: say("refunded"), value: rp(in.Refunded)})
	}
	var notes []string
	if taxed {
		notes = append(notes, pdf.Wrap(say("shippingNote"), 8.5, false, invRight-invLeft)...)
	}
	notes = append(notes, pdf.Wrap(say("note"), 8.5, false, invRight-invLeft)...)
	if y+6+float64(len(rows))*invRow+10+float64(len(notes))*12 > invBottom {
		newPage()
	}
	y += 6
	for _, r := range rows {
		if r.total {
			page.Line(320, y-10, invRight, y-10, 0.8, 0)
		}
		page.Text(320, y, 9, r.bold, r.label)
		page.TextRight(invRight, y, 9, r.bold, r.value)
		y += invRow
	}
	y += 10
	for _, n := range notes {
		page.Text(invLeft, y, 8.5, false, n)
		y += 12
	}

	pages := doc.Pages()
	for i, p := range pages {
		p.Line(invLeft, pdf.PageHeight-44, invRight, pdf.PageHeight-44, 0.5, 0.85)
		p.Text(invLeft, pdf.PageHeight-30, 8, false, in.Number)
		p.TextRight(invRight, pdf.PageHeight-30, 8, false, say("page", i+1, len(pages)))
	}
	return doc.Bytes()
}
