package httpapi

import (
	"context"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/modules/antispam"
)

// apiKeyRatePerMinute is what one API key may send; people on the console are not limited.
const apiKeyRatePerMinute = 600

// sharedHitTimeout bounds the count in Postgres, so a slow database delays a request only briefly
// before the in-memory count takes over.
const sharedHitTimeout = 2 * time.Second

// keyLimiter is a fixed window per key, one minute unless set. A limiter with a bucket counts in
// Postgres, so every API process shares the window; when that call fails, or the limiter has no
// bucket, it counts in this process's memory.
type keyLimiter struct {
	mu     sync.Mutex
	limit  int
	period int64
	window int64
	counts map[string]int
	// bucket names the limiter in rate_limits; srv gives the database and the log.
	bucket string
	srv    *Server
}

func newKeyLimiter(limit int) *keyLimiter { return newPeriodLimiter(limit, time.Minute) }

func newPeriodLimiter(limit int, period time.Duration) *keyLimiter {
	return &keyLimiter{limit: limit, period: int64(period.Seconds()), counts: map[string]int{}}
}

// shareLimits moves the limits on public endpoints to Postgres. The API key limit stays in memory:
// it guards signed requests, and a count per request there would cost a write each.
func (s *Server) shareLimits() {
	if s.DB == nil {
		return
	}
	for bucket, l := range map[string]*keyLimiter{
		"ai-client": s.aiClients, "ai-total": s.aiTotal, "signin-client": s.signInClients, "signin-email": s.signInEmails,
		"mail-email": s.mailEmails, "signup-client": s.signUpClients, "signup-email": s.signUpEmails,
		"subdomain-client": s.subdomainChecks, "assistant-user": s.assistantUsers, antispam.AssistantDaily: s.assistantTenants,
		"complaint-client": s.complaintClients, "voucher-client": s.voucherClients,
	} {
		if l != nil {
			l.bucket, l.srv = bucket, s
		}
	}
}

// hit counts one request and returns how many the key has made in the current window.
func (l *keyLimiter) hit(key string, now time.Time) int {
	if l.srv != nil {
		ctx, cancel := context.WithTimeout(context.Background(), sharedHitTimeout)
		used, err := antispam.Hit(ctx, l.srv.DB.Pool, l.bucket, key, time.Duration(l.period)*time.Second, now)
		cancel()
		if err == nil {
			return used
		}
		l.srv.Log.Warn("shared rate limit not counted; counting in memory", "bucket", l.bucket, "err", err)
	}
	window := now.Unix() / l.period
	l.mu.Lock()
	defer l.mu.Unlock()
	if window != l.window {
		l.window, l.counts = window, map[string]int{}
	}
	l.counts[key]++
	return l.counts[key]
}

// allow counts one request and writes the rate headers.
func (l *keyLimiter) allow(key string, w http.ResponseWriter) bool {
	return l.allowUpTo(key, l.limit, w)
}

// allowUpTo is allow with a limit chosen per call, for a limit that depends on the key.
func (l *keyLimiter) allowUpTo(key string, limit int, w http.ResponseWriter) bool {
	now := time.Now()
	used := l.hit(key, now)
	w.Header().Set("X-RateLimit-Limit", strconv.Itoa(limit))
	w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(max(0, limit-used)))
	if used > limit {
		w.Header().Set("Retry-After", strconv.FormatInt(l.period-now.Unix()%l.period, 10))
		return false
	}
	return true
}
