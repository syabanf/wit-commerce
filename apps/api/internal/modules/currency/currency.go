// Package currency keeps the exchange rates that show shoppers estimated prices in other currencies.
// Stores sell, charge and report in rupiah; a rate here only changes what a shopper reads. It owns
// the currency_rates table and no collection.
package currency

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
)

// Codes are the currencies a store may offer besides rupiah, in the order the console lists them.
var Codes = domain.DisplayCurrencies

// Fallback holds units per 1 IDR for when the table has no row for a code, so development and demos
// work without a network. It mirrors FALLBACK_RATES in packages/fixtures/src/currency.ts.
var Fallback = map[string]float64{
	"USD": 0.000055364,
	"SGD": 0.000070773,
	"MYR": 0.00022456,
	"EUR": 0.000049371,
	"JPY": 0.0087573,
	"AUD": 0.000080197,
	"GBP": 0.000041247,
	"CNY": 0.0003693,
	"THB": 0.0018525,
}

const (
	SourceAuto     = "auto"
	SourceManual   = "manual"
	SourceFallback = "fallback"
	// refreshedBy marks the rows the automatic refresh wrote.
	refreshedBy = "frankfurter"
	// DefaultURL is Frankfurter's v1 API (ECB reference rates, no key). api.frankfurter.app answers
	// with a redirect to it, and the outbound client follows no redirects.
	DefaultURL     = "https://api.frankfurter.dev/v1"
	refreshEvery   = 24 * time.Hour
	retryAfter     = time.Hour
	requestTimeout = 10 * time.Second
)

// Currency reads and refreshes the rates.
type Currency struct {
	*kernel.Runtime
	Log *slog.Logger
	// URL is the Frankfurter API root; empty means DefaultURL.
	URL string

	mu sync.Mutex
	// next is the app time the refresh is due; zero means it reads the table first.
	next time.Time
}

// Rate is one currency's rate as the console shows it.
type Rate struct {
	Code string `json:"code"`
	// Rate is units of the currency per 1 IDR.
	Rate float64 `json:"rate"`
	// Source is auto, manual, or fallback when no rate is saved and the built-in one applies.
	Source    string  `json:"source"`
	UpdatedAt *string `json:"updatedAt"`
	UpdatedBy *string `json:"updatedBy"`
	// AgeSeconds is how long ago the rate was saved; null for a fallback rate.
	AgeSeconds *int64 `json:"ageSeconds"`
}

// Rates is the answer of the currency settings routes.
type Rates struct {
	Rates []Rate `json:"rates"`
	// Refresh is the outcome of the refresh the request ran; only POST .../refresh sets it.
	Refresh *RefreshOutcome `json:"refresh,omitempty"`
}

// RefreshOutcome says what one refresh did.
type RefreshOutcome struct {
	Ok bool `json:"ok"`
	// Updated counts the automatic rates written; manual ones are never touched.
	Updated int    `json:"updated"`
	Error   string `json:"error,omitempty"`
}

// RateInput sets one code to a manual rate, or back to the automatic one.
type RateInput struct {
	Code   string   `json:"code"`
	Source string   `json:"source"`
	Rate   *float64 `json:"rate,omitempty"`
}

// RatesInput is the body of PUT /settings/currencies.
type RatesInput struct {
	Rates []RateInput `json:"rates"`
}

// ShopRate is what a storefront needs: the code and its rate.
type ShopRate struct {
	Code string  `json:"code"`
	Rate float64 `json:"rate"`
}

type row struct {
	rate      float64
	source    string
	updatedAt time.Time
	updatedBy string
}

func (c *Currency) saved(ctx context.Context) (map[string]row, error) {
	rows, err := c.DB.Pool.Query(ctx, `select code, rate, source, updated_at, updated_by from currency_rates`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]row{}
	for rows.Next() {
		var code string
		var r row
		if err := rows.Scan(&code, &r.rate, &r.source, &r.updatedAt, &r.updatedBy); err != nil {
			return nil, err
		}
		out[code] = r
	}
	return out, rows.Err()
}

// List reports every supported code: its saved rate, or the fallback.
func (c *Currency) List(ctx context.Context) (Rates, error) {
	saved, err := c.saved(ctx)
	if err != nil {
		return Rates{}, err
	}
	now := c.Clock.Now()
	out := Rates{Rates: make([]Rate, 0, len(Codes))}
	for _, code := range Codes {
		r, ok := saved[code]
		if !ok {
			out.Rates = append(out.Rates, Rate{Code: code, Rate: Fallback[code], Source: SourceFallback})
			continue
		}
		at, by := clock.Iso(r.updatedAt), r.updatedBy
		age := max(0, int64(now.Sub(r.updatedAt).Seconds()))
		out.Rates = append(out.Rates, Rate{Code: code, Rate: r.rate, Source: r.source, UpdatedAt: &at, UpdatedBy: &by, AgeSeconds: &age})
	}
	return out, nil
}

// ForShop returns the rates of the given codes, saved or fallback, skipping codes not supported.
func (c *Currency) ForShop(ctx context.Context, codes []string) ([]ShopRate, error) {
	out := []ShopRate{}
	if len(codes) == 0 {
		return out, nil
	}
	saved, err := c.saved(ctx)
	if err != nil {
		return nil, err
	}
	for _, code := range codes {
		if !slices.Contains(Codes, code) {
			continue
		}
		rate := Fallback[code]
		if r, ok := saved[code]; ok {
			rate = r.rate
		}
		out = append(out, ShopRate{Code: code, Rate: rate})
	}
	return out, nil
}

// Save applies manual rates and switches codes back to automatic. A code switched back keeps its
// last rate until the next refresh, which it makes due at once.
func (c *Currency) Save(ctx context.Context, m kernel.Meta, in RatesInput) (Rates, error) {
	if len(in.Rates) == 0 {
		return Rates{}, kernel.Invalid{Reason: "Send at least one rate."}
	}
	toAuto := false
	for _, r := range in.Rates {
		if !slices.Contains(Codes, r.Code) {
			return Rates{}, kernel.Invalid{Reason: fmt.Sprintf("%q is not a supported currency.", r.Code)}
		}
		switch r.Source {
		case SourceManual:
			if r.Rate == nil || !(*r.Rate > 0) || math.IsInf(*r.Rate, 0) {
				return Rates{}, kernel.Invalid{Reason: "Enter a rate above zero for " + r.Code + "."}
			}
		case SourceAuto:
			toAuto = true
		default:
			return Rates{}, kernel.Invalid{Reason: "Source must be auto or manual."}
		}
	}
	tx, err := c.DB.Pool.Begin(ctx)
	if err != nil {
		return Rates{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	for _, r := range in.Rates {
		if r.Source == SourceManual {
			_, err = tx.Exec(ctx, `insert into currency_rates (code, rate, source, updated_at, updated_by) values ($1, $2, 'manual', $3, $4)
				on conflict (code) do update set rate = excluded.rate, source = 'manual', updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
				r.Code, *r.Rate, m.At, m.By())
		} else {
			_, err = tx.Exec(ctx, `update currency_rates set source = 'auto', updated_at = $2, updated_by = $3 where code = $1 and source = 'manual'`,
				r.Code, m.At, m.By())
		}
		if err != nil {
			return Rates{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Rates{}, err
	}
	if toAuto {
		c.mu.Lock()
		c.next = c.Clock.Now()
		c.mu.Unlock()
	}
	return c.List(ctx)
}

// RefreshIfDue runs the automatic refresh at most once a day, and an hour after a failure. The timer
// calls it every minute; a failure keeps the old rates and goes to the log.
func (c *Currency) RefreshIfDue(ctx context.Context) {
	now := c.Clock.Now()
	c.mu.Lock()
	if c.next.IsZero() {
		var last *time.Time
		if err := c.DB.Pool.QueryRow(ctx, `select max(updated_at) from currency_rates where updated_by = $1`, refreshedBy).Scan(&last); err != nil {
			c.mu.Unlock()
			c.Log.Error("currency rates not read", "err", err)
			return
		}
		c.next = now
		if last != nil {
			c.next = last.Add(refreshEvery)
		}
	}
	due := !now.Before(c.next)
	c.mu.Unlock()
	if due {
		c.Refresh(ctx)
	}
}

// Refresh fetches the rates now and writes every code that is not manual.
func (c *Currency) Refresh(ctx context.Context) RefreshOutcome {
	now := c.Clock.Now()
	rates, err := c.fetch(ctx)
	if err == nil {
		var n int
		n, err = c.store(ctx, rates, now)
		if err == nil {
			c.schedule(now.Add(refreshEvery))
			return RefreshOutcome{Ok: true, Updated: n}
		}
	}
	c.schedule(now.Add(retryAfter))
	c.Log.Error("currency rates not refreshed; keeping the saved ones", "err", err)
	return RefreshOutcome{Error: err.Error()}
}

func (c *Currency) schedule(at time.Time) {
	c.mu.Lock()
	c.next = at
	c.mu.Unlock()
}

func (c *Currency) store(ctx context.Context, rates map[string]float64, now time.Time) (int, error) {
	n := 0
	for _, code := range Codes {
		rate, ok := rates[code]
		if !ok {
			continue
		}
		tag, err := c.DB.Pool.Exec(ctx, `insert into currency_rates (code, rate, source, updated_at, updated_by) values ($1, $2, 'auto', $3, $4)
			on conflict (code) do update set rate = excluded.rate, updated_at = excluded.updated_at, updated_by = excluded.updated_by
			where currency_rates.source = 'auto'`, code, rate, now, refreshedBy)
		if err != nil {
			return n, err
		}
		n += int(tag.RowsAffected())
	}
	return n, nil
}

// latest is Frankfurter's answer to /latest.
type latest struct {
	Base  string             `json:"base"`
	Rates map[string]float64 `json:"rates"`
}

// fetch asks for the rates with IDR as the base. Should Frankfurter stop accepting IDR as a base, it
// asks with EUR, the ECB's own base, and divides: units per IDR = (units per EUR) / (IDR per EUR).
func (c *Currency) fetch(ctx context.Context) (map[string]float64, error) {
	got, err := c.get(ctx, "IDR", Codes)
	if err == nil && got.Base == "IDR" && len(got.Rates) > 0 {
		return valid(got.Rates), nil
	}
	others := slices.DeleteFunc(slices.Clone(Codes), func(code string) bool { return code == "EUR" })
	viaEUR, errEUR := c.get(ctx, "EUR", append(others, "IDR"))
	if errEUR != nil {
		if err == nil {
			err = errEUR
		}
		return nil, err
	}
	idr := viaEUR.Rates["IDR"]
	if !(idr > 0) {
		return nil, errors.New("frankfurter: no IDR rate in the EUR answer")
	}
	out := map[string]float64{"EUR": 1 / idr}
	for code, rate := range viaEUR.Rates {
		if code != "IDR" {
			out[code] = rate / idr
		}
	}
	return valid(out), nil
}

// valid keeps the supported codes with a usable rate.
func valid(rates map[string]float64) map[string]float64 {
	out := map[string]float64{}
	for code, rate := range rates {
		if slices.Contains(Codes, code) && rate > 0 && !math.IsInf(rate, 0) {
			out[code] = rate
		}
	}
	return out
}

func (c *Currency) get(ctx context.Context, base string, to []string) (latest, error) {
	if c.HTTP == nil {
		return latest{}, errors.New("no outbound HTTP client")
	}
	ctx, cancel := context.WithTimeout(ctx, requestTimeout)
	defer cancel()
	root := strings.TrimRight(c.URL, "/")
	if root == "" {
		root = DefaultURL
	}
	q := url.Values{"from": {base}, "to": {strings.Join(to, ",")}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, root+"/latest?"+q.Encode(), nil)
	if err != nil {
		return latest{}, err
	}
	req.Header.Set("Accept", "application/json")
	res, err := c.HTTP.Do(req)
	if err != nil {
		return latest{}, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 64<<10))
	if err != nil {
		return latest{}, err
	}
	if res.StatusCode != http.StatusOK {
		return latest{}, fmt.Errorf("frankfurter answered %d for base %s", res.StatusCode, base)
	}
	var out latest
	if err := json.Unmarshal(body, &out); err != nil {
		return latest{}, fmt.Errorf("frankfurter: %w", err)
	}
	return out, nil
}
