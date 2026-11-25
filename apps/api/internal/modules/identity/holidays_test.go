package identity

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"
)

// TestSeedHolidaysMatchTheFixturesAndTheMigration reads PUBLIC_HOLIDAYS in
// packages/fixtures/src/holidays.ts and the rows migration 0039 inserts, and compares both with
// SeedHolidays, so the reducer, a fresh database and a reset database count the same days.
func TestSeedHolidaysMatchTheFixturesAndTheMigration(t *testing.T) {
	_, file, _, _ := runtime.Caller(0)
	root := filepath.Join(filepath.Dir(file), "..", "..", "..", "..", "..")
	read := func(parts ...string) string {
		raw, err := os.ReadFile(filepath.Join(append([]string{root}, parts...)...))
		if err != nil {
			t.Fatal(err)
		}
		return string(raw)
	}
	want := make([]string, 0, len(SeedHolidays))
	for _, h := range SeedHolidays {
		want = append(want, fmt.Sprintf("%s|%s|%s|%t", h.Date, h.Name, h.Kind, h.Confirmed))
	}
	sources := map[string]*regexp.Regexp{
		filepath.Join("packages", "fixtures", "src", "holidays.ts"):                                 regexp.MustCompile(`\{\s*date: '([\d-]+)',\s*name: '([^']+)',\s*kind: '(\w+)',\s*confirmed: (true|false),?\s*\}`),
		filepath.Join("apps", "api", "internal", "store", "migrations", "0039_public_holidays.sql"): regexp.MustCompile(`\('([\d-]+)', '([^']+)', '(\w+)', (true|false)\)`),
	}
	for path, pattern := range sources {
		var got []string
		for _, m := range pattern.FindAllStringSubmatch(read(path), -1) {
			got = append(got, strings.Join(m[1:], "|"))
		}
		if strings.Join(got, "\n") != strings.Join(want, "\n") {
			t.Errorf("%s holds %d holidays that differ from SeedHolidays (%d)", path, len(got), len(want))
		}
	}
}
