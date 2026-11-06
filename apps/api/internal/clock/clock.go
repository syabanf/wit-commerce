// Package clock is the demo clock: it starts at the fixtures' "now" and ticks in real time from the
// moment the database was first seeded, so every app and the server agree on what time it is.
package clock

import (
	"fmt"
	"time"
)

// FixtureNow is the instant every seeded timestamp is relative to (packages/fixtures/src/clock.ts).
const FixtureNow = "2026-10-05T09:41:00+07:00"

// WIB is Jakarta time; all calendar math happens in it.
var WIB = time.FixedZone("WIB", 7*3600)

// Clock reports the app time. Anchor is the real instant that maps to FixtureNow.
type Clock struct {
	Anchor time.Time
}

// New builds a clock anchored at the given real instant.
func New(anchor time.Time) Clock { return Clock{Anchor: anchor} }

// Now is the current app time.
func (c Clock) Now() time.Time {
	return MustParse(FixtureNow).Add(time.Since(c.Anchor))
}

// NowIso is Now formatted the way the apps store timestamps.
func (c Clock) NowIso() string { return Iso(c.Now()) }

// Iso formats an instant as 2026-09-22T08:12:00+07:00.
func Iso(t time.Time) string { return t.In(WIB).Format("2006-01-02T15:04:05-07:00") }

// Parse reads any RFC 3339 timestamp.
func Parse(iso string) (time.Time, error) {
	t, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse time %q: %w", iso, err)
	}
	return t, nil
}

// MustParse is Parse for literals and trusted data.
func MustParse(iso string) time.Time {
	t, err := Parse(iso)
	if err != nil {
		panic(err)
	}
	return t
}

// Ms is the instant as Unix milliseconds, the unit the TypeScript rules compare in.
func Ms(iso string) int64 {
	t, err := Parse(iso)
	if err != nil {
		return 0
	}
	return t.UnixMilli()
}

// FromMs is the inverse of Ms.
func FromMs(ms int64) time.Time { return time.UnixMilli(ms).In(WIB) }

const (
	Hour = int64(3_600_000)
	Day  = 24 * Hour
)

// IsoPtr formats an optional moment, keeping nil.
func IsoPtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := Iso(*t)
	return &s
}
