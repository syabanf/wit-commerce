package rules

import (
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// Holidays mirror packages/fixtures/src/holidays.ts: the working-day calendar behind the legal
// return floor (PP 80/2019 Pasal 69(1)) and complaint due times (Pasal 27). A working day is Monday
// to Friday in WIB that is neither a public holiday nor one of the brand's closed days.

// ClosedDays mirrors ClosedDays: the dates (YYYY-MM-DD, WIB) a working-day count skips besides
// weekends. Nil skips weekends only.
type ClosedDays map[string]bool

// MaxClosedDays mirrors MAX_CLOSED_DAYS.
const MaxClosedDays = 60

// ClosedDaysOf mirrors closedDaysOf: the platform's holidays and the brand's own closed days.
func ClosedDaysOf(holidays []string, t domain.Tenant) ClosedDays {
	out := make(ClosedDays, len(holidays)+len(t.ClosedDays))
	for _, d := range holidays {
		out[d] = true
	}
	for _, d := range t.ClosedDays {
		out[d] = true
	}
	return out
}

// IsWorkingDay mirrors isWorkingDay for the WIB day that holds t.
func IsWorkingDay(t time.Time, closed ClosedDays) bool {
	t = t.In(clock.WIB)
	wd := t.Weekday()
	return wd != time.Saturday && wd != time.Sunday && !closed[t.Format(time.DateOnly)]
}

// IsCalendarDate mirrors isCalendarDate: a real date written YYYY-MM-DD.
func IsCalendarDate(s string) bool {
	d, err := time.Parse(time.DateOnly, s)
	return err == nil && d.Format(time.DateOnly) == s
}

// NormalizeClosedDays mirrors normalizeClosedDays: trimmed, sorted, without repeats.
func NormalizeClosedDays(days []string) []string {
	out := make([]string, 0, len(days))
	for _, d := range days {
		out = append(out, strings.TrimSpace(d))
	}
	slices.Sort(out)
	return slices.Compact(out)
}

// ClosedDaysBlocker mirrors closedDaysBlocker on a normalized list.
func ClosedDaysBlocker(days []string) string {
	if len(days) > MaxClosedDays {
		return fmt.Sprintf("Keep at most %d closed days.", MaxClosedDays)
	}
	for _, d := range days {
		if !IsCalendarDate(d) {
			if d == "" {
				d = "An empty date"
			}
			return d + " is not a date written YYYY-MM-DD."
		}
	}
	return ""
}
