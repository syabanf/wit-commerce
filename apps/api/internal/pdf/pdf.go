// Package pdf writes small PDF 1.4 documents with no outside library: text in the built-in
// Helvetica and Helvetica-Bold fonts (WinAnsi encoding), lines and filled rectangles, on A4 pages.
// Coordinates are in points from the top-left corner of the page. Output is deterministic: the same
// calls give the same bytes, so tests can compare it with a golden file.
package pdf

import (
	"bytes"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// A4 in points.
const (
	PageWidth  = 595.28
	PageHeight = 841.89
)

// Doc is a document under construction.
type Doc struct {
	Title string
	pages []*Page
}

// Page is one page's content stream.
type Page struct {
	buf bytes.Buffer
}

// AddPage starts a new page and returns it.
func (d *Doc) AddPage() *Page {
	p := &Page{}
	d.pages = append(d.pages, p)
	return p
}

// Pages lists the pages in order.
func (d *Doc) Pages() []*Page { return d.pages }

// num writes a coordinate with at most two decimals, a hundredth of a point.
func num(f float64) string { return strconv.FormatFloat(math.Round(f*100)/100, 'f', -1, 64) }

func fontName(bold bool) string {
	if bold {
		return "/F2"
	}
	return "/F1"
}

// Text draws s with its baseline at y, starting at x.
func (p *Page) Text(x, y, size float64, bold bool, s string) {
	fmt.Fprintf(&p.buf, "BT %s %s Tf %s %s Td (%s) Tj ET\n", fontName(bold), num(size), num(x), num(PageHeight-y), escape(winAnsi(s)))
}

// TextRight draws s so that it ends at right.
func (p *Page) TextRight(right, y, size float64, bold bool, s string) {
	p.Text(right-Width(s, size, bold), y, size, bold, s)
}

// Line draws a straight line of the given width in grey g (0 black, 1 white).
func (p *Page) Line(x1, y1, x2, y2, width, g float64) {
	fmt.Fprintf(&p.buf, "%s G %s w %s %s m %s %s l S\n", num(g), num(width), num(x1), num(PageHeight-y1), num(x2), num(PageHeight-y2))
}

// FillRect fills a rectangle whose top-left corner is at x, y with grey g, then sets the fill back
// to black for text.
func (p *Page) FillRect(x, y, w, h, g float64) {
	fmt.Fprintf(&p.buf, "%s g %s %s %s %s re f 0 g\n", num(g), num(x), num(PageHeight-y-h), num(w), num(h))
}

// Width is how wide s is in points at the given size.
func Width(s string, size float64, bold bool) float64 {
	widths := &regular
	if bold {
		widths = &boldWidths
	}
	total := 0
	for _, b := range []byte(winAnsi(s)) {
		total += charWidth(widths, b)
	}
	return float64(total) * size / 1000
}

// Wrap breaks s into lines no wider than max at the given size, at spaces where it can and inside a
// word only when one word alone is too wide.
func Wrap(s string, size float64, bold bool, max float64) []string {
	var lines []string
	for _, para := range strings.Split(s, "\n") {
		line := ""
		for _, word := range strings.Fields(para) {
			for r := []rune(word); Width(word, size, bold) > max && len(r) > 1; r = []rune(word) {
				if line != "" {
					lines, line = append(lines, line), ""
				}
				cut := len(r) - 1
				for cut > 1 && Width(string(r[:cut]), size, bold) > max {
					cut--
				}
				lines, word = append(lines, string(r[:cut])), string(r[cut:])
			}
			switch {
			case line == "":
				line = word
			case Width(line+" "+word, size, bold) <= max:
				line += " " + word
			default:
				lines, line = append(lines, line), word
			}
		}
		lines = append(lines, line)
	}
	return lines
}

// Bytes writes the document: catalog, page tree, two fonts, then each page and its content.
func (d *Doc) Bytes() []byte {
	var out bytes.Buffer
	var offsets []int
	obj := func(body string) {
		offsets = append(offsets, out.Len())
		fmt.Fprintf(&out, "%d 0 obj\n%s\nendobj\n", len(offsets), body)
	}
	out.WriteString("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
	pages := d.pages
	if len(pages) == 0 {
		pages = []*Page{{}}
	}
	const firstPage = 6 // 1 catalog, 2 pages, 3 and 4 fonts, 5 info
	kids := make([]string, len(pages))
	for i := range pages {
		kids[i] = fmt.Sprintf("%d 0 R", firstPage+2*i)
	}
	obj("<< /Type /Catalog /Pages 2 0 R >>")
	obj(fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(kids, " "), len(pages)))
	obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
	obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
	obj(fmt.Sprintf("<< /Title (%s) /Producer (WIT Commerce) >>", escape(winAnsi(d.Title))))
	for i, p := range pages {
		obj(fmt.Sprintf("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %s %s] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents %d 0 R >>",
			num(PageWidth), num(PageHeight), firstPage+2*i+1))
		obj(fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", p.buf.Len(), p.buf.String()))
	}
	xref := out.Len()
	fmt.Fprintf(&out, "xref\n0 %d\n0000000000 65535 f \n", len(offsets)+1)
	for _, off := range offsets {
		fmt.Fprintf(&out, "%010d 00000 n \n", off)
	}
	fmt.Fprintf(&out, "trailer\n<< /Size %d /Root 1 0 R /Info 5 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(offsets)+1, xref)
	return out.Bytes()
}

// escape makes bytes safe inside a PDF literal string.
func escape(b []byte) string {
	var s strings.Builder
	for _, c := range b {
		switch c {
		case '(', ')', '\\':
			s.WriteByte('\\')
			s.WriteByte(c)
		default:
			s.WriteByte(c)
		}
	}
	return s.String()
}

// cp1252 holds the WinAnsi codes 0x80 to 0x9F that differ from Latin-1.
var cp1252 = map[rune]byte{
	'€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89,
	'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
	'–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F,
}

// winAnsi encodes s in WinAnsi; characters it cannot hold become "?" and control characters a space.
func winAnsi(s string) []byte {
	out := make([]byte, 0, len(s))
	for _, r := range s {
		switch {
		case r < 0x20:
			out = append(out, ' ')
		case r < 0x7F, r >= 0xA0 && r <= 0xFF:
			out = append(out, byte(r))
		default:
			if b, ok := cp1252[r]; ok {
				out = append(out, b)
			} else {
				out = append(out, '?')
			}
		}
	}
	return out
}

// Advance widths of Helvetica and Helvetica-Bold for codes 32 to 126, per 1000 units of font size,
// from the Adobe core font metrics.
var regular = [95]int{
	278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // space to /
	556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, // 0 to ?
	1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, // @ to O
	667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, // P to _
	333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, // ` to o
	556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, // p to ~
}

var boldWidths = [95]int{
	278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
	556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
	975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
	667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
	333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
	611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
}

// latinBase maps the accented Latin-1 letters to the letter whose width they share.
const latinBase = "AAAAAAACEEEEIIII" + "DNOOOOO*OUUUUYPs" + "aaaaaaaceeeeiiii" + "dnooooo/ouuuuypy"

func charWidth(w *[95]int, b byte) int {
	switch {
	case b >= 32 && b <= 126:
		return w[b-32]
	case b >= 0xC0:
		base := latinBase[b-0xC0]
		if base >= 32 && base <= 126 {
			return w[base-32]
		}
	}
	return 556
}
