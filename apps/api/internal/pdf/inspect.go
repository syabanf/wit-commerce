package pdf

import (
	"bytes"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// Info is what Inspect reads back from a document this package wrote.
type Info struct {
	Pages int
	// Text holds every string drawn, page by page, in drawing order, decoded from WinAnsi.
	Text [][]string
}

var (
	startxref = regexp.MustCompile(`startxref\n(\d+)\n%%EOF\n$`)
	pageCount = regexp.MustCompile(`/Type /Pages /Kids \[[^\]]*\] /Count (\d+)`)
	stream    = regexp.MustCompile(`(?s)<< /Length (\d+) >>\nstream\n`)
	shown     = regexp.MustCompile(`\(((?:\\.|[^\\)])*)\) Tj`)
)

// Inspect checks the structure of a document this package wrote: the header, the cross-reference
// table (every offset lands on its object), the page count and each stream's length. It returns the
// pages and their text, so tests can assert on what an invoice says.
func Inspect(doc []byte) (Info, error) {
	if !bytes.HasPrefix(doc, []byte("%PDF-1.4\n")) {
		return Info{}, fmt.Errorf("no PDF 1.4 header")
	}
	m := startxref.FindSubmatch(doc)
	if m == nil {
		return Info{}, fmt.Errorf("no startxref at the end")
	}
	xref, _ := strconv.Atoi(string(m[1]))
	if xref >= len(doc) || !bytes.HasPrefix(doc[xref:], []byte("xref\n0 ")) {
		return Info{}, fmt.Errorf("startxref %d does not point at the xref table", xref)
	}
	lines := strings.Split(string(doc[xref:]), "\n")
	var count int
	if _, err := fmt.Sscanf(lines[1], "0 %d", &count); err != nil {
		return Info{}, fmt.Errorf("xref subsection: %w", err)
	}
	for i := 1; i < count; i++ {
		entry := lines[2+i]
		if len(entry)+1 != 20 {
			return Info{}, fmt.Errorf("xref entry %d is %d bytes, not 20", i, len(entry)+1)
		}
		off, err := strconv.Atoi(entry[:10])
		if err != nil {
			return Info{}, err
		}
		if !bytes.HasPrefix(doc[off:], fmt.Appendf(nil, "%d 0 obj\n", i)) {
			return Info{}, fmt.Errorf("xref offset %d of object %d does not start that object", off, i)
		}
	}
	pm := pageCount.FindSubmatch(doc)
	if pm == nil {
		return Info{}, fmt.Errorf("no page tree")
	}
	info := Info{}
	info.Pages, _ = strconv.Atoi(string(pm[1]))
	for _, loc := range stream.FindAllSubmatchIndex(doc, -1) {
		n, _ := strconv.Atoi(string(doc[loc[2]:loc[3]]))
		body := doc[loc[1]:]
		if n > len(body) || !bytes.HasPrefix(body[n:], []byte("endstream")) {
			return Info{}, fmt.Errorf("a stream's /Length %d does not end at endstream", n)
		}
		var page []string
		for _, s := range shown.FindAllSubmatch(body[:n], -1) {
			page = append(page, decode(s[1]))
		}
		info.Text = append(info.Text, page)
	}
	if len(info.Text) != info.Pages {
		return Info{}, fmt.Errorf("%d content streams for %d pages", len(info.Text), info.Pages)
	}
	return info, nil
}

// fromCP1252 reverses cp1252.
var fromCP1252 = func() map[byte]rune {
	m := make(map[byte]rune, len(cp1252))
	for r, b := range cp1252 {
		m[b] = r
	}
	return m
}()

// decode undoes escape and turns WinAnsi bytes back into text.
func decode(b []byte) string {
	var s strings.Builder
	for i := 0; i < len(b); i++ {
		c := b[i]
		if c == '\\' && i+1 < len(b) {
			i++
			c = b[i]
		}
		if r, ok := fromCP1252[c]; ok {
			s.WriteRune(r)
		} else {
			s.WriteRune(rune(c))
		}
	}
	return s.String()
}
