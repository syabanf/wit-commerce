package httpapi

import (
	"net/http"
	"strconv"
	"sync"
	"time"
)

// apiKeyRatePerMinute is what one API key may send; people on the console are not limited.
const apiKeyRatePerMinute = 600

// keyLimiter is a fixed window per key, one minute unless set, in memory: enough for one API instance.
type keyLimiter struct {
	mu     sync.Mutex
	limit  int
	period int64
	window int64
	counts map[string]int
}

func newKeyLimiter(limit int) *keyLimiter { return newPeriodLimiter(limit, time.Minute) }

func newPeriodLimiter(limit int, period time.Duration) *keyLimiter {
	return &keyLimiter{limit: limit, period: int64(period.Seconds()), counts: map[string]int{}}
}

// allow counts one request and writes the rate headers.
func (l *keyLimiter) allow(key string, w http.ResponseWriter) bool {
	now := time.Now().Unix()
	window := now / l.period
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
		w.Header().Set("Retry-After", strconv.FormatInt(l.period-now%l.period, 10))
		return false
	}
	return true
}
