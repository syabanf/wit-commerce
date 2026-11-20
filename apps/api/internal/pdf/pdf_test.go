package pdf

import (
	"bytes"
	"flag"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

var update = flag.Bool("update", false, "rewrite the golden files")

// golden compares got with testdata/name, or rewrites it with -update.
func golden(t *testing.T, name string, got []byte) {
	t.Helper()
	path := filepath.Join("testdata", name)
	if *update {
		if err := os.WriteFile(path, got, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%v (run go test -update once)", err)
	}
	if !bytes.Equal(got, want) {
		t.Errorf("%s changed; inspect the output and rerun with -update if it is right", name)
	}
}

func sample() *Doc {
	d := &Doc{Title: "Sample (1)"}
	p := d.AddPage()
	p.Text(48, 64, 16, true, "PT Lari Nusantara")
	p.TextRight(PageWidth-48, 64, 9, false, "Rp 1.250.000")
	p.Line(48, 80, PageWidth-48, 80, 0.5, 0.85)
	p.FillRect(44, 90, 100, 16, 0.93)
	p.Text(48, 100, 9, false, `Kaos (merah) \ ukuran L · café — “bagus” €5`)
	d.AddPage().Text(48, 64, 9, false, "Halaman 2")
	return d
}

func TestDocumentStructure(t *testing.T) {
	out := sample().Bytes()
	info, err := Inspect(out)
	if err != nil {
		t.Fatal(err)
	}
	if info.Pages != 2 {
		t.Errorf("pages: %d", info.Pages)
	}
	want := [][]string{{"PT Lari Nusantara", "Rp 1.250.000", `Kaos (merah) \ ukuran L · café — “bagus” €5`}, {"Halaman 2"}}
	if !slices.EqualFunc(info.Text, want, slices.Equal) {
		t.Errorf("text: %q", info.Text)
	}
	golden(t, "sample.pdf", out)
}

func TestInspectCatchesABrokenXref(t *testing.T) {
	out := sample().Bytes()
	broken := bytes.Replace(out, []byte("1 0 obj"), []byte("1 0 obk"), 1)
	if _, err := Inspect(broken); err == nil {
		t.Error("a moved object passed")
	}
	if _, err := Inspect(out[:len(out)-3]); err == nil {
		t.Error("a cut-off file passed")
	}
}

func TestWidthAndWrap(t *testing.T) {
	// H 722, e 556, l 222, l 222, o 556 in Helvetica; bold widens the lower case.
	if w := Width("Hello", 10, false); w != 22.78 {
		t.Errorf("regular width %v", w)
	}
	if w := Width("Hello", 10, true); w <= 22.78 {
		t.Errorf("bold width %v", w)
	}
	if Width("é", 10, false) != Width("e", 10, false) {
		t.Error("an accented letter takes its base letter's width")
	}
	lines := Wrap("Sepatu lari jalan raya dengan bantalan empuk untuk jarak jauh", 9, false, 100)
	if len(lines) < 2 {
		t.Fatalf("no wrap: %q", lines)
	}
	for _, l := range lines {
		if Width(l, 9, false) > 100 {
			t.Errorf("line too wide: %q", l)
		}
	}
	long := Wrap("Supercalifragilisticexpialidocious", 9, false, 40)
	if len(long) < 2 || Width(long[0], 9, false) > 40 {
		t.Errorf("a long word is not broken: %q", long)
	}
}
