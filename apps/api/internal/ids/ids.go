// Package ids makes the prefixed ids the apps use: "mv-k3f9a1b2c3".
package ids

import (
	"crypto/rand"
	"math/big"
	"strconv"
	"strings"
	"time"
)

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"

// New returns prefix + "-" + the last four base-36 digits of the time + six random base-36 digits,
// the same shape as newId() in packages/fixtures.
func New(prefix string) string {
	stamp := strconv.FormatInt(time.Now().UnixMilli(), 36)
	if len(stamp) > 4 {
		stamp = stamp[len(stamp)-4:]
	}
	var b strings.Builder
	b.Grow(len(prefix) + 11)
	b.WriteString(prefix)
	b.WriteByte('-')
	b.WriteString(stamp)
	for range 6 {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		b.WriteByte(alphabet[n.Int64()])
	}
	return b.String()
}

// NextCode is the next sequential code after the highest existing one with the prefix:
// NextCode([LARI-10001], "LARI-", 5) → LARI-10002.
func NextCode(existing []string, prefix string, digits int) string {
	max := 0
	for _, code := range existing {
		if !strings.HasPrefix(code, prefix) {
			continue
		}
		n, err := strconv.Atoi(code[len(prefix):])
		if err == nil && n > max {
			max = n
		}
	}
	return prefix + leftPad(strconv.Itoa(max+1), digits)
}

func leftPad(s string, n int) string {
	if len(s) >= n {
		return s
	}
	return strings.Repeat("0", n-len(s)) + s
}
