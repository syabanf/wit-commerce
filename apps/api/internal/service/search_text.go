package service

import (
	"strings"
	"unicode/utf8"
)

const (
	// searchMaxRunes and searchMaxWords bound what one query costs.
	searchMaxRunes = 100
	searchMaxWords = 8
	// searchAltsPerWord caps the synonyms tried for one word.
	searchAltsPerWord = 4
)

var accentFold = map[rune]rune{
	'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
	'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
	'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
	'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ø': 'o',
	'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
	'ý': 'y', 'ÿ': 'y', 'ñ': 'n', 'ç': 'c',
}

// FoldSearch is search_fold from migration 0035: lower case, Latin accents stripped, every run of
// other characters one space, trimmed. Both sides of a comparison go through the same rules.
func FoldSearch(s string) string {
	if utf8.RuneCountInString(s) > searchMaxRunes {
		s = string([]rune(s)[:searchMaxRunes])
	}
	var b strings.Builder
	gap := false
	for _, r := range strings.ToLower(s) {
		if f, ok := accentFold[r]; ok {
			r = f
		}
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			if gap && b.Len() > 0 {
				b.WriteByte(' ')
			}
			gap = false
			b.WriteRune(r)
			continue
		}
		gap = true
	}
	return b.String()
}

// synonymGroups pair the Indonesian and English words shoppers use for the same thing. A word in a
// group also matches the others, so "sepatu" finds "running shoes" and "socks" finds "kaos kaki".
var synonymGroups = [][]string{
	{"sepatu", "shoes", "sneakers"},
	{"sandal", "sandals"},
	{"kaos", "kaus", "tshirt", "tee"},
	{"kemeja", "shirt"},
	{"baju", "clothes", "apparel"},
	{"celana", "pants", "trousers"},
	{"jaket", "jacket"},
	{"tas", "bag"},
	{"topi", "hat", "cap"},
	{"socks", "kaos kaki"},
	{"jam", "watch"},
	{"kacamata", "glasses", "sunglasses"},
	{"botol", "bottle"},
	{"wanita", "women", "woman", "perempuan"},
	{"pria", "men", "man"},
	{"anak", "kids", "kid", "children"},
	{"hitam", "black"},
	{"putih", "white"},
	{"merah", "red"},
	{"biru", "blue"},
	{"hijau", "green"},
	{"abu", "grey", "gray"},
	{"lari", "running", "run"},
	{"kopi", "coffee"},
	{"teh", "tea"},
	{"buku", "book"},
	{"kursi", "chair"},
	{"meja", "table", "desk"},
	{"handuk", "towel"},
	{"sabun", "soap"},
	{"krim", "cream"},
	{"minyak", "oil"},
	{"hadiah", "gift"},
}

var synonyms = func() map[string][]string {
	out := map[string][]string{}
	for _, g := range synonymGroups {
		for _, w := range g {
			if !strings.Contains(w, " ") {
				out[w] = g
			}
		}
	}
	return out
}()

// searchWords splits a folded query into words, each with the alternatives that may stand for it:
// the word itself first, then its synonyms.
func searchWords(folded string) [][]string {
	words := strings.Fields(folded)
	if len(words) > searchMaxWords {
		words = words[:searchMaxWords]
	}
	out := make([][]string, 0, len(words))
	for _, w := range words {
		alts := []string{w}
		for _, s := range synonyms[w] {
			if s != w && len(alts) < searchAltsPerWord {
				alts = append(alts, s)
			}
		}
		out = append(out, alts)
	}
	return out
}

// trigrams are pg_trgm's trigrams of each word: two spaces before, one after.
func trigrams(s string) map[string]bool {
	out := map[string]bool{}
	for _, w := range strings.Fields(s) {
		padded := "  " + w + " "
		for i := 0; i+3 <= len(padded); i++ {
			out[padded[i:i+3]] = true
		}
	}
	return out
}

// trigramSimilarity is pg_trgm's similarity(): shared trigrams over all distinct trigrams.
func trigramSimilarity(a, b string) float64 {
	ta, tb := trigrams(a), trigrams(b)
	if len(ta) == 0 || len(tb) == 0 {
		return 0
	}
	shared := 0
	for t := range ta {
		if tb[t] {
			shared++
		}
	}
	return float64(shared) / float64(len(ta)+len(tb)-shared)
}

// didYouMean swaps each query word that matches nothing for the closest word in the store's
// vocabulary, when one is close enough. It answers "" when no word changed.
func didYouMean(words []string, vocabulary []string) string {
	const minSimilarity = 0.3
	changed := false
	out := make([]string, len(words))
	for i, w := range words {
		out[i] = w
		best, bestSim := "", minSimilarity
		for _, v := range vocabulary {
			if v == w {
				best = ""
				break
			}
			if s := trigramSimilarity(w, v); s > bestSim || (s == bestSim && best != "" && v < best) {
				best, bestSim = v, s
			}
		}
		if best != "" {
			out[i], changed = best, true
		}
	}
	if !changed {
		return ""
	}
	return strings.Join(out, " ")
}
