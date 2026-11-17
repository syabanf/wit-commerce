package antispam

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
)

const (
	// VerifyURL is where Cloudflare checks a Turnstile token.
	VerifyURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
	// settingsAudit is the tenant id the audit rows of platform settings carry.
	settingsAudit  = "platform"
	secretSealAD   = "captcha_settings/turnstile_secret"
	verifyTimeout  = 8 * time.Second
	maxTokenLength = 2048
)

// Antispam reads and saves the Turnstile keys and checks tokens with Cloudflare.
type Antispam struct {
	*kernel.Runtime
}

// CaptchaSettings is what the console shows of the Turnstile setup. It never holds the secret.
type CaptchaSettings struct {
	// SiteKey is public: the sign-up pages render the widget with it. Empty means the check is off.
	SiteKey     string `json:"siteKey"`
	SecretSet   bool   `json:"secretSet"`
	SecretLast4 string `json:"secretLast4"`
	// UpdatedAt and UpdatedBy describe the saved keys; null while none are saved.
	UpdatedAt *string `json:"updatedAt"`
	UpdatedBy *string `json:"updatedBy"`
}

// CaptchaInput replaces the site key and, when Secret is not empty, the secret. Both empty turns
// the check off.
type CaptchaInput struct {
	SiteKey string `json:"siteKey"`
	Secret  string `json:"secret,omitempty"`
}

type storedCaptcha struct {
	CaptchaSettings
	sealed []byte
}

func (a *Antispam) stored(ctx context.Context) (storedCaptcha, bool, error) {
	var s storedCaptcha
	var by string
	var at time.Time
	err := a.DB.Pool.QueryRow(ctx, `select site_key, ciphertext, last4, updated_by, updated_at from captcha_settings`).
		Scan(&s.SiteKey, &s.sealed, &s.SecretLast4, &by, &at)
	if errors.Is(err, pgx.ErrNoRows) {
		return s, false, nil
	}
	s.SecretSet, s.UpdatedAt, s.UpdatedBy = true, kernel.Ptr(clock.Iso(at)), &by
	return s, err == nil, err
}

// GetCaptcha reports the saved keys, without the secret.
func (a *Antispam) GetCaptcha(ctx context.Context) (CaptchaSettings, error) {
	s, _, err := a.stored(ctx)
	return s.CaptchaSettings, err
}

// SiteKey is the public key, or "" while the check is off or the row cannot be read.
func (a *Antispam) SiteKey(ctx context.Context) string {
	if a.DB == nil {
		return ""
	}
	s, _, _ := a.stored(ctx)
	return s.SiteKey
}

// SaveCaptcha stores the keys. The first save needs both; later an empty secret keeps the saved one.
func (a *Antispam) SaveCaptcha(ctx context.Context, m kernel.Meta, in CaptchaInput) (CaptchaSettings, error) {
	siteKey, secret := strings.TrimSpace(in.SiteKey), strings.TrimSpace(in.Secret)
	if len(siteKey) > 200 || len(secret) > 200 {
		return CaptchaSettings{}, kernel.Invalid{Reason: "Paste the keys as Cloudflare shows them."}
	}
	if a.Vault == nil {
		return CaptchaSettings{}, errors.New("no vault to encrypt the Turnstile secret")
	}
	old, exists, err := a.stored(ctx)
	if err != nil {
		return CaptchaSettings{}, err
	}
	err = pgx.BeginFunc(ctx, a.DB.Pool, func(tx pgx.Tx) error {
		switch {
		case siteKey == "" && secret == "":
			if _, err := tx.Exec(ctx, `delete from captcha_settings`); err != nil || !exists {
				return err
			}
			return kernel.LogCredential(ctx, tx, m, settingsAudit, "Turnstile keys", "removed")
		case siteKey == "":
			return kernel.Invalid{Reason: "Enter the Turnstile site key."}
		case secret == "" && !exists:
			return kernel.Invalid{Reason: "Enter the Turnstile secret key."}
		}
		sealed, last4 := old.sealed, old.SecretLast4
		if secret != "" {
			if sealed, err = a.Vault.Seal(secret, secretSealAD); err != nil {
				return err
			}
			last4 = lastFour(secret)
		}
		if _, err := tx.Exec(ctx, `insert into captcha_settings (site_key, ciphertext, last4, updated_by, updated_at)
			values ($1, $2, $3, $4, $5)
			on conflict (id) do update set site_key = excluded.site_key, ciphertext = excluded.ciphertext, last4 = excluded.last4,
				updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
			siteKey, sealed, last4, m.By(), clock.MustParse(m.At)); err != nil {
			return err
		}
		return kernel.LogCredential(ctx, tx, m, settingsAudit, "Turnstile keys", "updated")
	})
	if err != nil {
		return CaptchaSettings{}, err
	}
	return a.GetCaptcha(ctx)
}

// ErrCaptchaFailed is a missing or refused token.
var ErrCaptchaFailed = errors.New("the captcha token was refused")

// Verify checks a Turnstile token with Cloudflare. With no keys saved it passes everything, so an
// installation without Turnstile behaves as before. It returns ErrCaptchaFailed for a token
// Cloudflare refuses, and any other error when Cloudflare could not be asked.
func (a *Antispam) Verify(ctx context.Context, token, clientIP string) error {
	s, on, err := a.stored(ctx)
	if err != nil || !on {
		return err
	}
	token = strings.TrimSpace(token)
	if token == "" || len(token) > maxTokenLength {
		return ErrCaptchaFailed
	}
	if a.Vault == nil || a.HTTP == nil {
		return errors.New("turnstile is on, but this process has no vault or outbound client")
	}
	secret, err := a.Vault.Open(s.sealed, secretSealAD)
	if err != nil {
		return fmt.Errorf("saved Turnstile secret does not decrypt; is CREDENTIALS_KEY the one it was saved with? %w", err)
	}
	ctx, cancel := context.WithTimeout(ctx, verifyTimeout)
	defer cancel()
	form := url.Values{"secret": {secret}, "response": {token}, "remoteip": {clientIP}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, VerifyURL, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := a.HTTP.Do(req)
	if err != nil {
		// A transport error can quote the request; the secret is in the body, never the URL.
		return errors.New("cloudflare turnstile did not answer")
	}
	defer res.Body.Close()
	var out struct {
		Success bool `json:"success"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&out); err != nil {
		return fmt.Errorf("cloudflare turnstile answered %d without JSON", res.StatusCode)
	}
	if !out.Success {
		return ErrCaptchaFailed
	}
	return nil
}

// lastFour shows the end of a secret long enough to keep the rest hidden.
func lastFour(secret string) string {
	r := []rune(secret)
	if len(r) <= 8 {
		return ""
	}
	return string(r[len(r)-4:])
}
