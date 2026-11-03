package httpapi

import (
	"net/http"
	"strconv"
	"sync"
	"time"
)

// apiKeyRatePerMinute is what one API key may send; people on the console are not limited.
const apiKeyRatePerMinute = 600

// keyLimiter is a fixed one-minute window per key, in memory: enough for one API instance.
type keyLimiter struct {
	mu     sync.Mutex
	limit  int
	window int64
	counts map[string]int
}

func newKeyLimiter(limit int) *keyLimiter { return &keyLimiter{limit: limit, counts: map[string]int{}} }

// allow counts one request and writes the rate headers.
func (l *keyLimiter) allow(key string, w http.ResponseWriter) bool {
	now := time.Now().Unix()
	window := now / 60
	l.mu.Lock()
	if window != l.window {
		l.window, l.counts = window, map[string]int{}
	}
	l.counts[key]++
	used := l.counts[key]
	l.mu.Unlock()
	w.Header().Set("X-RateLimit-Limit", strconv.Itoa(l.limit))
	w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(max(0, l.limit-used)))
	if used > l.limit {
		w.Header().Set("Retry-After", strconv.FormatInt(60-now%60, 10))
		return false
	}
	return true
}
