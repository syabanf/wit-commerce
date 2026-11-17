package notifications

import (
	"fmt"
	"html"
	"regexp"
	"strconv"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// Every email, staff and shopper alike, goes through one layout: a table-based page with inline
// styles that mail clients render the same, at most 600 pixels wide so it fits a phone, with a
// plain-text part beside it. Store emails carry the brand's name, logo and primary colour; platform
// emails carry WIT Commerce's.

// Branding is whose email it is.
type Branding struct {
	Name string
	// LogoURL is an absolute image address; empty shows the name as text.
	LogoURL string
	// Color is the accent of the header bar and the button, as #rrggbb.
	Color string
	// HomeURL is where the footer links.
	HomeURL string
}

// platformColor is WIT red, the accent of the console's theme.
const platformColor = "#ed1c24"

// PlatformBranding is WIT Commerce's own, for staff email.
func PlatformBranding(publicURL string) Branding {
	return Branding{Name: "WIT Commerce", Color: platformColor, HomeURL: publicURL}
}

var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// StoreBranding is a brand's own. A relative logo address is made absolute on publicURL, since a
// mail client has no page to resolve it against.
func StoreBranding(t domain.Tenant, storeURL, publicURL string) Branding {
	b := Branding{Name: t.Name, Color: platformColor, HomeURL: storeURL}
	if hexColor.MatchString(t.Brand.Colors.Primary) {
		b.Color = t.Brand.Colors.Primary
	}
	if t.Brand.LogoURL != nil && *t.Brand.LogoURL != "" {
		logo := *t.Brand.LogoURL
		if strings.HasPrefix(logo, "/") {
			logo = strings.TrimRight(publicURL, "/") + logo
		}
		if strings.HasPrefix(logo, "https://") || strings.HasPrefix(logo, "http://") {
			b.LogoURL = logo
		}
	}
	return b
}

// Row is a label and a value, for details and totals.
type Row struct{ Label, Value string }

// Line is one item of an order or a return.
type Line struct {
	Name   string
	Detail string
	Amount string
}

// Link is the email's one button.
type Link struct{ Label, URL string }

// Email is the content the layout lays out. Every field but Title is optional.
type Email struct {
	Title string
	// Greeting is a line of its own before the intro.
	Greeting string
	Intro    string
	Lines    []Line
	Totals   []Row
	Rows     []Row
	// Note is a highlighted paragraph, such as payment instructions.
	Note   string
	Action *Link
	// Footer is the small print under the content.
	Footer string
}

// Render lays out an email as HTML and as plain text.
func Render(b Branding, e Email) (htmlBody, text string) {
	esc := html.EscapeString
	var h, t strings.Builder
	const font = `font-family:Helvetica,Arial,sans-serif;`
	h.WriteString(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>`)
	h.WriteString(esc(e.Title))
	h.WriteString(`</title></head><body style="margin:0;padding:0;background:#f1f0f1;">`)
	h.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f0f1;"><tr><td align="center" style="padding:24px 12px;">`)
	h.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">`)
	// Header bar: logo or name on the brand colour.
	fmt.Fprintf(&h, `<tr><td style="background:%s;padding:20px 24px;%scolor:#ffffff;font-size:20px;font-weight:bold;">`, b.Color, font)
	if b.LogoURL != "" {
		fmt.Fprintf(&h, `<img src="%s" alt="%s" height="36" style="display:block;height:36px;max-width:200px;border:0;">`, esc(b.LogoURL), esc(b.Name))
	} else {
		h.WriteString(esc(b.Name))
	}
	h.WriteString(`</td></tr>`)
	fmt.Fprintf(&h, `<tr><td style="padding:24px;%scolor:#101112;font-size:15px;line-height:22px;">`, font)
	fmt.Fprintf(&h, `<h1 style="margin:0 0 12px;font-size:22px;line-height:28px;color:#101112;">%s</h1>`, esc(e.Title))
	t.WriteString(b.Name + "\n\n" + e.Title + "\n")
	if e.Greeting != "" {
		fmt.Fprintf(&h, `<p style="margin:0 0 8px;">%s</p>`, esc(e.Greeting))
		t.WriteString("\n" + e.Greeting + "\n")
	}
	if e.Intro != "" {
		fmt.Fprintf(&h, `<p style="margin:0 0 16px;">%s</p>`, esc(e.Intro))
		t.WriteString("\n" + e.Intro + "\n")
	}
	if len(e.Lines) > 0 {
		h.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;border-top:1px solid #e4e3e4;">`)
		t.WriteString("\n")
		for _, l := range e.Lines {
			fmt.Fprintf(&h, `<tr><td style="padding:10px 0;border-bottom:1px solid #e4e3e4;%sfont-size:14px;"><strong>%s</strong>`, font, esc(l.Name))
			if l.Detail != "" {
				fmt.Fprintf(&h, `<br><span style="color:#6b6b70;">%s</span>`, esc(l.Detail))
			}
			fmt.Fprintf(&h, `</td><td align="right" style="padding:10px 0;border-bottom:1px solid #e4e3e4;%sfont-size:14px;white-space:nowrap;">%s</td></tr>`, font, esc(l.Amount))
			t.WriteString("- " + l.Name)
			if l.Detail != "" {
				t.WriteString(" (" + l.Detail + ")")
			}
			t.WriteString(": " + l.Amount + "\n")
		}
		h.WriteString(`</table>`)
	}
	writeRows := func(rows []Row, boldLast bool) {
		h.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">`)
		for i, r := range rows {
			weight := "normal"
			if boldLast && i == len(rows)-1 {
				weight = "bold"
			}
			fmt.Fprintf(&h, `<tr><td style="padding:4px 0;%sfont-size:14px;color:#6b6b70;">%s</td><td align="right" style="padding:4px 0;%sfont-size:14px;font-weight:%s;">%s</td></tr>`,
				font, esc(r.Label), font, weight, esc(r.Value))
			t.WriteString(r.Label + ": " + r.Value + "\n")
		}
		h.WriteString(`</table>`)
	}
	if len(e.Totals) > 0 {
		writeRows(e.Totals, true)
	}
	if len(e.Rows) > 0 {
		t.WriteString("\n")
		writeRows(e.Rows, false)
	}
	if e.Note != "" {
		fmt.Fprintf(&h, `<p style="margin:0 0 16px;padding:12px 16px;background:#f1f0f1;border-radius:8px;font-size:14px;">%s</p>`, esc(e.Note))
		t.WriteString("\n" + e.Note + "\n")
	}
	if e.Action != nil {
		fmt.Fprintf(&h, `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px;"><tr><td style="background:%s;border-radius:999px;">`+
			`<a href="%s" style="display:inline-block;padding:12px 24px;%scolor:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">%s</a></td></tr></table>`,
			b.Color, esc(e.Action.URL), font, esc(e.Action.Label))
		t.WriteString("\n" + e.Action.Label + ": " + e.Action.URL + "\n")
	}
	if e.Footer != "" {
		fmt.Fprintf(&h, `<p style="margin:16px 0 0;font-size:12px;line-height:18px;color:#6b6b70;">%s</p>`, esc(e.Footer))
		t.WriteString("\n" + e.Footer + "\n")
	}
	h.WriteString(`</td></tr>`)
	fmt.Fprintf(&h, `<tr><td style="padding:16px 24px;background:#f7f7f8;%sfont-size:12px;color:#6b6b70;">`, font)
	if b.HomeURL != "" {
		fmt.Fprintf(&h, `<a href="%s" style="color:#6b6b70;">%s</a>`, esc(b.HomeURL), esc(b.Name))
		t.WriteString("\n" + b.Name + " · " + b.HomeURL + "\n")
	} else {
		h.WriteString(esc(b.Name))
	}
	h.WriteString(`</td></tr></table></td></tr></table></body></html>`)
	return h.String(), t.String()
}

// Rupiah formats an amount as the apps do: Rp 125.000.
func Rupiah(n int) string {
	sign := ""
	if n < 0 {
		sign, n = "-", -n
	}
	digits := strconv.Itoa(n)
	var b strings.Builder
	for i, d := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			b.WriteByte('.')
		}
		b.WriteRune(d)
	}
	return sign + "Rp " + b.String()
}
