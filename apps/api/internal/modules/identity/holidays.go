package identity

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Public holidays live in the public_holidays table, platform-wide, kept by platform admins. With
// each brand's closedDays they make the calendar working-day deadlines count on.

// Holiday is one national holiday or cuti bersama.
type Holiday struct {
	Date      string  `json:"date"`
	Name      string  `json:"name"`
	Kind      string  `json:"kind"`
	Confirmed bool    `json:"confirmed"`
	UpdatedBy *string `json:"updatedBy"`
	UpdatedAt *string `json:"updatedAt"`
}

// SeedHolidays mirrors PUBLIC_HOLIDAYS in packages/fixtures/src/holidays.ts and the rows migration
// 0039 inserts; holidays_test.go compares the three. The seed loader puts them back after a reset.
var SeedHolidays = []Holiday{
	{Date: "2026-01-01", Name: "Tahun Baru 2026 Masehi", Kind: "national", Confirmed: false},
	{Date: "2026-01-16", Name: "Isra Mikraj Nabi Muhammad SAW", Kind: "national", Confirmed: false},
	{Date: "2026-02-16", Name: "Cuti bersama Tahun Baru Imlek", Kind: "cuti_bersama", Confirmed: false},
	{Date: "2026-02-17", Name: "Tahun Baru Imlek 2577 Kongzili", Kind: "national", Confirmed: false},
	{Date: "2026-03-18", Name: "Cuti bersama Hari Suci Nyepi", Kind: "cuti_bersama", Confirmed: false},
	{Date: "2026-03-19", Name: "Hari Suci Nyepi (Tahun Baru Saka 1948)", Kind: "national", Confirmed: false},
	{Date: "2026-03-20", Name: "Cuti bersama Idul Fitri 1447 H", Kind: "cuti_bersama", Confirmed: false},
	{Date: "2026-03-21", Name: "Hari Raya Idul Fitri 1447 H", Kind: "national", Confirmed: false},
	{Date: "2026-03-22", Name: "Hari Raya Idul Fitri 1447 H", Kind: "national", Confirmed: false},
	{Date: "2026-03-23", Name: "Cuti bersama Idul Fitri 1447 H", Kind: "cuti_bersama", Confirmed: false},
	{Date: "2026-03-24", Name: "Cuti bersama Idul Fitri 1447 H", Kind: "cuti_bersama", Confirmed: false},
	{Date: "2026-04-03", Name: "Wafat Yesus Kristus", Kind: "national", Confirmed: false},
	{Date: "2026-04-05", Name: "Kebangkitan Yesus Kristus (Paskah)", Kind: "national", Confirmed: false},
	{Date: "2026-05-01", Name: "Hari Buruh Internasional", Kind: "national", Confirmed: false},
	{Date: "2026-05-14", Name: "Kenaikan Yesus Kristus", Kind: "national", Confirmed: false},
	{Date: "2026-05-15", Name: "Cuti bersama Kenaikan Yesus Kristus", Kind: "cuti_bersama", Confirmed: false},
	{Date: "2026-05-27", Name: "Hari Raya Idul Adha 1447 H", Kind: "national", Confirmed: false},
	{Date: "2026-05-28", Name: "Cuti bersama Idul Adha 1447 H", Kind: "cuti_bersama", Confirmed: false},
	{Date: "2026-05-31", Name: "Hari Raya Waisak 2570 BE", Kind: "national", Confirmed: false},
	{Date: "2026-06-01", Name: "Hari Lahir Pancasila", Kind: "national", Confirmed: false},
	{Date: "2026-06-16", Name: "Tahun Baru Islam 1448 H", Kind: "national", Confirmed: false},
	{Date: "2026-08-17", Name: "Proklamasi Kemerdekaan Republik Indonesia", Kind: "national", Confirmed: false},
	{Date: "2026-08-25", Name: "Maulid Nabi Muhammad SAW", Kind: "national", Confirmed: false},
	{Date: "2026-12-24", Name: "Cuti bersama Kelahiran Yesus Kristus", Kind: "cuti_bersama", Confirmed: false},
	{Date: "2026-12-25", Name: "Kelahiran Yesus Kristus (Hari Natal)", Kind: "national", Confirmed: false},
	{Date: "2027-01-01", Name: "Tahun Baru 2027 Masehi", Kind: "national", Confirmed: true},
	{Date: "2027-01-05", Name: "Isra Mikraj Nabi Muhammad SAW 1448 H", Kind: "national", Confirmed: true},
	{Date: "2027-02-05", Name: "Cuti bersama Tahun Baru Imlek", Kind: "cuti_bersama", Confirmed: true},
	{Date: "2027-02-06", Name: "Tahun Baru Imlek 2578 Kongzili", Kind: "national", Confirmed: true},
	{Date: "2027-03-08", Name: "Hari Suci Nyepi (Tahun Baru Saka 1949)", Kind: "national", Confirmed: true},
	{Date: "2027-03-09", Name: "Cuti bersama Idul Fitri 1448 H", Kind: "cuti_bersama", Confirmed: true},
	{Date: "2027-03-10", Name: "Hari Raya Idul Fitri 1448 H", Kind: "national", Confirmed: true},
	{Date: "2027-03-11", Name: "Hari Raya Idul Fitri 1448 H", Kind: "national", Confirmed: true},
	{Date: "2027-03-12", Name: "Cuti bersama Idul Fitri 1448 H", Kind: "cuti_bersama", Confirmed: true},
	{Date: "2027-03-15", Name: "Cuti bersama Idul Fitri 1448 H", Kind: "cuti_bersama", Confirmed: true},
	{Date: "2027-03-25", Name: "Cuti bersama Wafat Yesus Kristus", Kind: "cuti_bersama", Confirmed: true},
	{Date: "2027-03-26", Name: "Wafat Yesus Kristus", Kind: "national", Confirmed: true},
	{Date: "2027-03-28", Name: "Kebangkitan Yesus Kristus (Paskah)", Kind: "national", Confirmed: true},
	{Date: "2027-05-01", Name: "Hari Buruh Internasional", Kind: "national", Confirmed: true},
	{Date: "2027-05-06", Name: "Kenaikan Yesus Kristus", Kind: "national", Confirmed: true},
	{Date: "2027-05-17", Name: "Hari Raya Idul Adha 1448 H", Kind: "national", Confirmed: true},
	{Date: "2027-05-18", Name: "Cuti bersama Idul Adha 1448 H", Kind: "cuti_bersama", Confirmed: true},
	{Date: "2027-05-19", Name: "Cuti bersama Waisak 2571 BE", Kind: "cuti_bersama", Confirmed: true},
	{Date: "2027-05-20", Name: "Hari Raya Waisak 2571 BE", Kind: "national", Confirmed: true},
	{Date: "2027-06-01", Name: "Hari Lahir Pancasila", Kind: "national", Confirmed: true},
	{Date: "2027-06-06", Name: "Tahun Baru Islam 1449 H", Kind: "national", Confirmed: true},
	{Date: "2027-08-15", Name: "Maulid Nabi Muhammad SAW", Kind: "national", Confirmed: true},
	{Date: "2027-08-17", Name: "Proklamasi Kemerdekaan Republik Indonesia", Kind: "national", Confirmed: true},
	{Date: "2027-12-24", Name: "Cuti bersama Kelahiran Yesus Kristus", Kind: "cuti_bersama", Confirmed: true},
	{Date: "2027-12-25", Name: "Kelahiran Yesus Kristus (Hari Natal)", Kind: "national", Confirmed: true},
	{Date: "2027-12-26", Name: "Isra Mikraj Nabi Muhammad SAW 1449 H", Kind: "national", Confirmed: true},
}

// Holidays lists every public holiday, oldest first.
func Holidays(ctx context.Context, q store.Querier) ([]Holiday, error) {
	rows, err := q.Query(ctx, `select day, name, kind, confirmed, updated_by, updated_at from public_holidays order by day`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Holiday, error) {
		var h Holiday
		var day time.Time
		var at *time.Time
		if err := row.Scan(&day, &h.Name, &h.Kind, &h.Confirmed, &h.UpdatedBy, &at); err != nil {
			return h, err
		}
		h.Date = day.Format(time.DateOnly)
		if at != nil {
			h.UpdatedAt = kernel.Ptr(clock.Iso(*at))
		}
		return h, nil
	})
}

// HolidayDates lists the dates of every public holiday, oldest first.
func HolidayDates(ctx context.Context, q store.Querier) ([]string, error) {
	rows, err := q.Query(ctx, `select to_char(day, 'YYYY-MM-DD') from public_holidays order by day`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// Calendar is the days a brand's working-day deadlines skip besides weekends: the public holidays
// and the brand's own closed days.
func Calendar(ctx context.Context, q store.Querier, t domain.Tenant) (rules.ClosedDays, error) {
	dates, err := HolidayDates(ctx, q)
	if err != nil {
		return nil, err
	}
	return rules.ClosedDaysOf(dates, t), nil
}

// SeedPublicHolidays inserts the seed list, keeping any date already there.
func SeedPublicHolidays(ctx context.Context, q store.Querier) error {
	for _, h := range SeedHolidays {
		if _, err := q.Exec(ctx, `insert into public_holidays (day, name, kind, confirmed) values ($1, $2, $3, $4)
			on conflict (day) do nothing`, h.Date, h.Name, h.Kind, h.Confirmed); err != nil {
			return err
		}
	}
	return nil
}

// HolidayInput is what a platform admin saves for one date.
type HolidayInput struct {
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	Confirmed bool   `json:"confirmed"`
}

// SaveHoliday adds or replaces the public holiday on date.
func (s *Identity) SaveHoliday(ctx context.Context, m kernel.Meta, date string, in HolidayInput) error {
	name := strings.TrimSpace(in.Name)
	switch {
	case !rules.IsCalendarDate(date):
		return kernel.Invalid{Reason: "Write the date as YYYY-MM-DD."}
	case name == "" || utf8.RuneCountInString(name) > 120:
		return kernel.Invalid{Reason: "Name the holiday in 1 to 120 characters."}
	case in.Kind != "national" && in.Kind != "cuti_bersama":
		return kernel.Invalid{Reason: "Pick national holiday or cuti bersama."}
	}
	_, err := s.DB.Pool.Exec(ctx, `insert into public_holidays (day, name, kind, confirmed, updated_by, updated_at)
		values ($1, $2, $3, $4, $5, $6)
		on conflict (day) do update set name = excluded.name, kind = excluded.kind, confirmed = excluded.confirmed,
			updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
		date, name, in.Kind, in.Confirmed, m.By(), clock.MustParse(m.At))
	return err
}

// RemoveHoliday deletes the public holiday on date.
func (s *Identity) RemoveHoliday(ctx context.Context, date string) error {
	if !rules.IsCalendarDate(date) {
		return kernel.Invalid{Reason: "Write the date as YYYY-MM-DD."}
	}
	tag, err := s.DB.Pool.Exec(ctx, `delete from public_holidays where day = $1`, date)
	if err == nil && tag.RowsAffected() == 0 {
		return kernel.NotFound{What: "holiday"}
	}
	return err
}

// SetClosedDays is tenants/setClosedDays: the days the brand is closed besides weekends and public
// holidays. An empty list clears them.
func (s *Identity) SetClosedDays(ctx context.Context, m kernel.Meta, tenantID string, days []string) (*kernel.Delta, error) {
	if err := kernel.Access(m, tenantID); err != nil {
		return nil, err
	}
	days = rules.NormalizeClosedDays(days)
	if why := rules.ClosedDaysBlocker(days); why != "" {
		return nil, kernel.Invalid{Reason: why}
	}
	return s.Run(ctx, func(t *kernel.Tx) error {
		tenant, err := kernel.Lock[domain.Tenant](t, "tenants", tenantID, "tenant")
		if err != nil {
			return err
		}
		tenant.ClosedDays = nil
		if len(days) > 0 {
			tenant.ClosedDays = days
		}
		return t.Put("tenants", tenant.ID, tenant)
	})
}
