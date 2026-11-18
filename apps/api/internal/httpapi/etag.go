package httpapi

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
)

// shopStateCache lets browsers and any cache in between keep a store's dataset for half a minute
// and serve it while they ask again. The event stream carries every change after that.
const shopStateCache = "public, max-age=30, stale-while-revalidate=60"

// writeShopState answers a store's public dataset with a weak ETag over everything but the clock,
// and 304 when the caller already holds that version. The clock stays out of the tag, since it
// changes on every request; the storefront also sets its clock from the event stream's hello.
func writeShopState(w http.ResponseWriter, r *http.Request, body map[string]any, now string) {
	raw, err := json.Marshal(body)
	if err != nil {
		writeProblem(w, http.StatusInternalServerError, "INTERNAL", "Something went wrong on our side.")
		return
	}
	sum := sha256.Sum256(raw)
	tag := `W/"` + base64.RawURLEncoding.EncodeToString(sum[:18]) + `"`
	h := w.Header()
	h.Set("ETag", tag)
	h.Set("Cache-Control", shopStateCache)
	if etagMatches(r.Header.Get("If-None-Match"), tag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	clock, _ := json.Marshal(now)
	var out bytes.Buffer
	out.Grow(len(raw) + len(clock) + 8)
	out.WriteString(`{"now":`)
	out.Write(clock)
	if len(raw) > 2 {
		out.WriteByte(',')
	}
	out.Write(raw[1:])
	out.WriteByte('\n')
	h.Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(out.Bytes())
}

// etagMatches compares If-None-Match with a tag the weak way: W/ prefixes do not count.
func etagMatches(header, tag string) bool {
	if header == "" {
		return false
	}
	want := strings.TrimPrefix(tag, "W/")
	for _, part := range strings.Split(header, ",") {
		part = strings.TrimSpace(part)
		if part == "*" || strings.TrimPrefix(part, "W/") == want {
			return true
		}
	}
	return false
}
