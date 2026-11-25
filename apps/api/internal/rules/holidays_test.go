package rules

import (
	"testing"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

// packages/fixtures/test/holidays.test.ts runs the same cases.
var christmas = ClosedDaysOf([]string{"2026-12-24", "2026-12-25"}, domain.Tenant{ClosedDays: []string{"2026-12-29"}})

func TestLegalReturnDeadlineSkipsHolidaysAndClosedDays(t *testing.T) {
	cases := []struct{ delivered, want string }{
		// Wednesday: Thursday and Friday are holidays, Monday counts, Tuesday is closed, Wednesday counts.
		{"2026-12-23T10:00:00+07:00", "2026-12-30T23:59:59.999+07:00"},
		// Without a calendar the same delivery ends on Friday.
		{"2026-12-21T10:00:00+07:00", "2026-12-23T23:59:59.999+07:00"},
	}
	for _, c := range cases {
		if got, want := LegalReturnDeadline(clock.Ms(c.delivered), christmas), clock.MustParse(c.want).UnixMilli(); got != want {
			t.Errorf("%s: got %s, want %s", c.delivered, clock.Iso(clock.FromMs(got)), c.want)
		}
	}
	if got, want := LegalReturnDeadline(clock.Ms("2026-12-23T10:00:00+07:00"), nil), clock.MustParse("2026-12-25T23:59:59.999+07:00").UnixMilli(); got != want {
		t.Errorf("weekends only: got %s", clock.Iso(clock.FromMs(got)))
	}
}

func TestAddWorkingDaysSkipsHolidaysAndClosedDays(t *testing.T) {
	if got := AddWorkingDays("2026-12-23T10:00:00+07:00", 3, christmas); got != "2026-12-31T10:00:00+07:00" {
		t.Errorf("got %s", got)
	}
}

func TestClosedDaysAreCheckedAndSorted(t *testing.T) {
	days := NormalizeClosedDays([]string{" 2026-12-31", "2026-12-30", "2026-12-31"})
	if len(days) != 2 || days[0] != "2026-12-30" || ClosedDaysBlocker(days) != "" {
		t.Errorf("got %v", days)
	}
	for _, bad := range []string{"2026-02-30", "31-12-2026", ""} {
		if ClosedDaysBlocker([]string{bad}) == "" {
			t.Errorf("%q passed", bad)
		}
	}
	if ClosedDaysBlocker(make([]string, MaxClosedDays+1)) != "Keep at most 60 closed days." {
		t.Error("no limit")
	}
}
