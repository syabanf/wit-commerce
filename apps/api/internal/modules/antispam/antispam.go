// Package antispam protects the public endpoints: request counts every API process shares, and the
// optional Cloudflare Turnstile check on sign-up and shopper registration. It writes the rate_limits
// and captcha_settings tables and owns no collection.
package antispam

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// AssistantDaily is the bucket that counts a brand's assistant questions per day. The usage page
// reads it, so the name lives here and not beside the other limits in the HTTP layer.
const AssistantDaily = "assistant-tenant"

// hashed keeps typed emails and client addresses out of the table.
func hashed(key string) string {
	sum := sha256.Sum256([]byte(key))
	return hex.EncodeToString(sum[:16])
}

// Hit counts one request in the bucket's current fixed window and returns the window's count. The
// upsert makes the count exact across processes.
func Hit(ctx context.Context, q store.Querier, bucket, key string, period time.Duration, now time.Time) (int, error) {
	seconds := int64(period.Seconds())
	window := now.Unix() / seconds
	var count int
	err := q.QueryRow(ctx, `insert into rate_limits (bucket, key, window_start, count, expires_at)
		values ($1, $2, $3, 1, to_timestamp($4))
		on conflict (bucket, key, window_start) do update set count = rate_limits.count + 1
		returning count`, bucket, hashed(key), window, (window+1)*seconds).Scan(&count)
	return count, err
}

// Count reads the current window's count without adding to it.
func Count(ctx context.Context, q store.Querier, bucket, key string, period time.Duration, now time.Time) (int, error) {
	var count int
	err := q.QueryRow(ctx, `select coalesce(sum(count), 0) from rate_limits where bucket = $1 and key = $2 and window_start = $3`,
		bucket, hashed(key), now.Unix()/int64(period.Seconds())).Scan(&count)
	return count, err
}

// Prune deletes the windows that have ended; the tick calls it.
func Prune(ctx context.Context, q store.Querier) error {
	_, err := q.Exec(ctx, `delete from rate_limits where expires_at < now()`)
	return err
}
