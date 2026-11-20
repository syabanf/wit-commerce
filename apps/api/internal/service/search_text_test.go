package service

import (
	"slices"
	"testing"
)

func TestFoldSearchMatchesTheSQLFold(t *testing.T) {
	for in, want := range map[string]string{
		"  Café-Latte  ":       "cafe latte",
		"SEPATU  Lari/Wanita!": "sepatu lari wanita",
		"Kaos T-Shirt 5\"":     "kaos t shirt 5",
		"Señor Ñandú Ølsen Ça": "senor nandu olsen ca",
		"":                     "",
		"!!!":                  "",
	} {
		if got := FoldSearch(in); got != want {
			t.Errorf("FoldSearch(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSearchWordsAddSynonyms(t *testing.T) {
	words := searchWords("sepatu merah xl")
	if len(words) != 3 || words[0][0] != "sepatu" || !slices.Contains(words[0], "shoes") || !slices.Contains(words[1], "red") || len(words[2]) != 1 {
		t.Fatalf("words: %v", words)
	}
	if got := searchWords("socks"); !slices.Contains(got[0], "kaos kaki") {
		t.Fatalf("socks: %v", got)
	}
	for _, alts := range searchWords("wanita pria anak lari kaos") {
		if len(alts) > searchAltsPerWord {
			t.Fatalf("too many alternatives: %v", alts)
		}
	}
	if got := searchWords("a b c d e f g h i j"); len(got) != searchMaxWords {
		t.Fatalf("word cap: %d", len(got))
	}
}

func TestDidYouMeanFixesOnlyUnknownWords(t *testing.T) {
	vocabulary := []string{"stability", "trail", "ridge", "velocity"}
	if got := didYouMean([]string{"stbaility"}, vocabulary); got != "stability" {
		t.Errorf("one word: %q", got)
	}
	if got := didYouMean([]string{"ridge", "trial"}, vocabulary); got != "" && got != "ridge trail" {
		t.Errorf("known word changed: %q", got)
	}
	if got := didYouMean([]string{"velocity"}, vocabulary); got != "" {
		t.Errorf("an exact word got a correction: %q", got)
	}
	if got := didYouMean([]string{"qqqzzz"}, vocabulary); got != "" {
		t.Errorf("nothing close: %q", got)
	}
}
