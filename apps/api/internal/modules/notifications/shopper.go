package notifications

import (
	"context"
	"fmt"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/mail"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Shopper emails report what happened to an order or a return. The facade gathers the facts in the
// action's transaction (ShopperFacts) and queues the message there too, so an email goes out only for
// a change that committed, and a dedupe key keeps a repeated event to one email.

// ShopperFacts is everything a shopper email shows, already formatted where it is money.
type ShopperFacts struct {
	Brand        Branding
	To           string
	CustomerName string
	OrderCode    string
	OrderURL     string
	Lines        []Line
	Subtotal     int
	Discount     int
	Shipping     int
	Total        int
	// AwaitingPayment is an online or transfer payment that has not arrived.
	AwaitingPayment bool
	// PayOnline means a provider collects the payment on its own page, opened from the order page.
	PayOnline bool
	// PaymentInstructions are the payment type's own words, for a manual transfer.
	PaymentInstructions string
	CashOnDelivery      bool
	Courier             string
	TrackingNo          string
	// Amount is the money a refund email reports.
	Amount     int
	ReturnCode string

	// RefundReference traces a return's refund; RefundByTransfer says staff sent it by bank transfer.
	RefundReference  string
	RefundByTransfer bool

	// Lang is the store's language, "id" or "en" (rules.StoreLanguage). Empty means English.
	Lang string
}

// phrases holds every sentence of the shopper emails, the marketing footer and the unsubscribe page per
// language. Each map has the same keys; English fills any key a language lacks.
var phrases = map[string]map[string]string{
	"en": {
		"greeting":          "Hi %s,",
		"placed.subject":    "Your %s order %s",
		"placed.title":      "Thank you for your order",
		"placed.intro":      "We have your order %s and will let you know when it ships.",
		"placed.pay_online": "Your order waits for payment. Open the order page and press Pay now to pay %s.",
		"placed.pay_manual": "Your order waits for payment of %s.",
		"placed.cod":        "Pay the courier %s when the parcel arrives.",
		"paid.subject":      "Payment received for %s",
		"paid.title":        "Payment received",
		"paid.intro":        "We received your payment of %s for order %s. We are getting it ready.",
		"shipped.subject":   "Order %s is on its way",
		"shipped.title":     "Your order is on its way",
		"shipped.intro":     "Order %s left our warehouse.",
		"cancelled.subject": "Order %s was cancelled",
		"cancelled.title":   "Your order was cancelled",
		"cancelled.intro":   "We cancelled order %s.",
		"cancelled.refund":  "We are refunding %s to your original payment method.",
		"refunded.subject":  "Refund for order %s",
		"refunded.title":    "We sent your refund",
		"refunded.intro":    "We refunded %s for order %s to your original payment method.",
		"approved.subject":  "Return %s approved",
		"approved.title":    "Your return is approved",
		"approved.intro":    "We approved return %s for order %s. Send the items back and we will refund you once they arrive.",
		"retrefund.subject": "Refund for return %s",
		"retrefund.title":   "Your return is refunded",
		"retrefund.intro":   "We received return %s and refunded %s to your original payment method.",
		"retrefund.bank":    "We received return %s and sent %s to you by bank transfer.",
		"label.reference":   "Reference",
		"label.order":       "Order",
		"label.subtotal":    "Subtotal",
		"label.discount":    "Discount",
		"label.shipping":    "Shipping",
		"label.free":        "Free",
		"label.total":       "Total",
		"label.courier":     "Courier",
		"label.tracking":    "Tracking number",
		"label.return":      "Return",
		"label.refund":      "Refund",
		"action.order":      "See your order",
		"action.pay":        "Pay now",
		"footer":            "You get this email because you ordered from %s.",
		"greeting.anyone":   "there",
		"line.item":         "Item",
		"line.qty":          "Qty %d",
		"marketing.footer":  "You get this email because you agreed to offers and news from %s.",
		"unsubscribe":       "Unsubscribe",
		"unsubscribe.bad":   "This unsubscribe link is not valid. Ask the store to stop sending you offers.",
		"unsubscribe.ask":   "Stop offers and news from this store? Email about your orders still arrives.",
		"unsubscribe.done":  "You are unsubscribed. The store sends you no more offers or news.",
	},
	"id": {
		"greeting":          "Halo %s,",
		"placed.subject":    "Pesanan %[2]s di %[1]s",
		"placed.title":      "Terima kasih atas pesanan Anda",
		"placed.intro":      "Pesanan %s sudah kami terima. Kami kabari lagi saat pesanan dikirim.",
		"placed.pay_online": "Pesanan Anda menunggu pembayaran. Buka halaman pesanan dan tekan Bayar sekarang untuk membayar %s.",
		"placed.pay_manual": "Pesanan Anda menunggu pembayaran sebesar %s.",
		"placed.cod":        "Bayar %s ke kurir saat paket tiba.",
		"paid.subject":      "Pembayaran untuk %s sudah diterima",
		"paid.title":        "Pembayaran diterima",
		"paid.intro":        "Pembayaran Anda sebesar %s untuk pesanan %s sudah kami terima. Pesanan sedang kami siapkan.",
		"shipped.subject":   "Pesanan %s sedang dikirim",
		"shipped.title":     "Pesanan Anda sedang dikirim",
		"shipped.intro":     "Pesanan %s sudah keluar dari gudang kami.",
		"cancelled.subject": "Pesanan %s dibatalkan",
		"cancelled.title":   "Pesanan Anda dibatalkan",
		"cancelled.intro":   "Kami membatalkan pesanan %s.",
		"cancelled.refund":  "Kami mengembalikan dana %s ke metode pembayaran awal Anda.",
		"refunded.subject":  "Pengembalian dana pesanan %s",
		"refunded.title":    "Dana Anda sudah kami kembalikan",
		"refunded.intro":    "Kami mengembalikan dana %s untuk pesanan %s ke metode pembayaran awal Anda.",
		"approved.subject":  "Retur %s disetujui",
		"approved.title":    "Retur Anda disetujui",
		"approved.intro":    "Kami menyetujui retur %s untuk pesanan %s. Kirim kembali barangnya, dan kami kembalikan dana Anda setelah barang tiba.",
		"retrefund.subject": "Pengembalian dana retur %s",
		"retrefund.title":   "Dana retur Anda sudah dikembalikan",
		"retrefund.intro":   "Retur %s sudah kami terima dan dana %s sudah dikembalikan ke metode pembayaran awal Anda.",
		"retrefund.bank":    "Retur %s sudah kami terima dan dana %s sudah kami kirim lewat transfer bank.",
		"label.reference":   "Referensi",
		"label.order":       "Pesanan",
		"label.subtotal":    "Subtotal",
		"label.discount":    "Diskon",
		"label.shipping":    "Ongkos kirim",
		"label.free":        "Gratis",
		"label.total":       "Total",
		"label.courier":     "Kurir",
		"label.tracking":    "Nomor resi",
		"label.return":      "Retur",
		"label.refund":      "Pengembalian dana",
		"action.order":      "Lihat pesanan",
		"action.pay":        "Bayar sekarang",
		"footer":            "Anda menerima email ini karena berbelanja di %s.",
		"greeting.anyone":   "Kak",
		"line.item":         "Barang",
		"line.qty":          "Jumlah %d",
		"marketing.footer":  "Anda menerima email ini karena setuju menerima penawaran dan kabar dari %s.",
		"unsubscribe":       "Berhenti berlangganan",
		"unsubscribe.bad":   "Tautan berhenti berlangganan ini tidak berlaku. Minta toko berhenti mengirimi Anda penawaran.",
		"unsubscribe.ask":   "Berhenti menerima penawaran dan kabar dari toko ini? Email tentang pesanan Anda tetap dikirim.",
		"unsubscribe.done":  "Anda sudah berhenti berlangganan. Toko tidak mengirimi Anda penawaran atau kabar lagi.",
	},
}

// Say is one phrase in lang ("id" or "en"), with English for a language or key the map lacks.
func Say(lang, key string, args ...any) string {
	p, ok := phrases[lang][key]
	if !ok {
		p = phrases["en"][key]
	}
	return fmt.Sprintf(p, args...)
}

// ComposeShopper builds the email for one notice kind: order_placed, payment_received,
// order_shipped, order_cancelled, order_refunded, return_approved or return_refunded.
func ComposeShopper(kind string, f ShopperFacts) (mail.Message, bool) {
	say := func(key string, args ...any) string { return Say(f.Lang, key, args...) }
	name := firstWord(f.CustomerName)
	if name == "" {
		name = say("greeting.anyone")
	}
	e := Email{
		Greeting: say("greeting", name), Footer: say("footer", f.Brand.Name),
		Action: &Link{Label: say("action.order"), URL: f.OrderURL},
	}
	totals := func() []Row {
		rows := []Row{{say("label.subtotal"), Rupiah(f.Subtotal)}}
		if f.Discount > 0 {
			rows = append(rows, Row{say("label.discount"), Rupiah(-f.Discount)})
		}
		shipping := say("label.free")
		if f.Shipping > 0 {
			shipping = Rupiah(f.Shipping)
		}
		return append(rows, Row{say("label.shipping"), shipping}, Row{say("label.total"), Rupiah(f.Total)})
	}
	var subject string
	switch kind {
	case "order_placed":
		subject = say("placed.subject", f.Brand.Name, f.OrderCode)
		e.Title, e.Intro = say("placed.title"), say("placed.intro", f.OrderCode)
		e.Lines, e.Totals = f.Lines, totals()
		switch {
		case f.AwaitingPayment && f.PayOnline:
			e.Note = say("placed.pay_online", Rupiah(f.Total))
			e.Action.Label = say("action.pay")
		case f.AwaitingPayment:
			e.Note = strings.TrimSpace(say("placed.pay_manual", Rupiah(f.Total)) + " " + f.PaymentInstructions)
		case f.CashOnDelivery:
			e.Note = say("placed.cod", Rupiah(f.Total))
		}
	case "payment_received":
		subject = say("paid.subject", f.OrderCode)
		e.Title, e.Intro = say("paid.title"), say("paid.intro", Rupiah(f.Total), f.OrderCode)
	case "order_shipped":
		subject = say("shipped.subject", f.OrderCode)
		e.Title, e.Intro = say("shipped.title"), say("shipped.intro", f.OrderCode)
		e.Rows = []Row{{say("label.courier"), f.Courier}}
		if f.TrackingNo != "" {
			e.Rows = append(e.Rows, Row{say("label.tracking"), f.TrackingNo})
		}
	case "order_cancelled":
		subject = say("cancelled.subject", f.OrderCode)
		e.Title, e.Intro = say("cancelled.title"), say("cancelled.intro", f.OrderCode)
		if f.Amount > 0 {
			e.Note = say("cancelled.refund", Rupiah(f.Amount))
		}
	case "order_refunded":
		subject = say("refunded.subject", f.OrderCode)
		e.Title, e.Intro = say("refunded.title"), say("refunded.intro", Rupiah(f.Amount), f.OrderCode)
	case "return_approved":
		subject = say("approved.subject", f.ReturnCode)
		e.Title, e.Intro = say("approved.title"), say("approved.intro", f.ReturnCode, f.OrderCode)
		e.Lines = f.Lines
	case "return_refunded":
		subject = say("retrefund.subject", f.ReturnCode)
		e.Title, e.Intro = say("retrefund.title"), say("retrefund.intro", f.ReturnCode, Rupiah(f.Amount))
		e.Rows = []Row{{say("label.return"), f.ReturnCode}, {say("label.order"), f.OrderCode}, {say("label.refund"), Rupiah(f.Amount)}}
		if f.RefundByTransfer {
			e.Intro = say("retrefund.bank", f.ReturnCode, Rupiah(f.Amount))
		}
		if f.RefundReference != "" {
			e.Rows = append(e.Rows, Row{say("label.reference"), f.RefundReference})
		}
	default:
		return mail.Message{}, false
	}
	body, text := Render(f.Brand, e)
	return mail.Message{To: f.To, Subject: subject, HTML: body, Text: text}, true
}

func firstWord(name string) string {
	if fields := strings.Fields(name); len(fields) > 0 {
		return fields[0]
	}
	return ""
}

// QueueShopper queues a shopper email in the caller's transaction. A second email with the same
// dedupe key is dropped, so a repeated notification or a retried action sends once.
func QueueShopper(ctx context.Context, q store.Querier, dedupeKey, kind string, m mail.Message) error {
	_, err := q.Exec(ctx, `insert into email_outbox ("to", subject, html, text, kind, dedupe_key) values ($1, $2, $3, $4, $5, $6)
		on conflict (dedupe_key) where dedupe_key is not null do nothing`, m.To, m.Subject, m.HTML, m.Text, "shopper_"+kind, dedupeKey)
	return err
}
