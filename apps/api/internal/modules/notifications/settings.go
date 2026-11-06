package notifications

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	resend "github.com/syabanf/wit-commerce/apps/api/internal/mail"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

const (
	providerResend = "resend"
	// Sources say where the mail client comes from.
	SourceSettings = "settings"
	SourceEnv      = "env"
	SourceOff      = "off"
	// settingsTTL bounds how long On trusts its last read of email_settings. Drain and the settings
	// routes read afresh, so this only delays a change saved through another process.
	settingsTTL = 30 * time.Second
	// settingsAudit is the tenant id the audit rows of platform settings carry.
	settingsAudit  = "platform"
	settingsSealAD = "email_settings/resend_api_key"
)

// EmailSettings is what the console shows of the email setup. It never holds the key.
type EmailSettings struct {
	Provider string `json:"provider"`
	From     string `json:"from"`
	KeySet   bool   `json:"keySet"`
	KeyLast4 string `json:"keyLast4"`
	// UpdatedAt and UpdatedBy describe the saved settings; null while none are saved.
	UpdatedAt *string `json:"updatedAt"`
	UpdatedBy *string `json:"updatedBy"`
	// Source is settings, env or off: where the client that sends email comes from.
	Source string `json:"source"`
}

// EmailSettingsInput replaces the from address and, when Key is not empty, the key.
type EmailSettingsInput struct {
	Key  string `json:"key,omitempty"`
	From string `json:"from"`
}

// EmailTestResult is the outcome of one test email.
type EmailTestResult struct {
	Ok    bool   `json:"ok"`
	To    string `json:"to"`
	Error string `json:"error,omitempty"`
}

type resolved struct {
	client *resend.Client
	source string
	at     time.Time
}

type storedSettings struct {
	sealed    []byte
	last4     string
	from      string
	updatedBy string
	updatedAt time.Time
}

// loadStored reads the saved row, if any; forUpdate locks it for a save.
func loadStored(ctx context.Context, q store.Querier, forUpdate bool) (storedSettings, bool, error) {
	var s storedSettings
	query := `select ciphertext, last4, from_address, updated_by, updated_at from email_settings`
	if forUpdate {
		query += ` for update`
	}
	err := q.QueryRow(ctx, query).Scan(&s.sealed, &s.last4, &s.from, &s.updatedBy, &s.updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return s, false, nil
	}
	return s, err == nil, err
}

// load picks the client: saved settings first, then the environment's client in n.Mail.
func (n *Notifications) load(ctx context.Context) (resolved, error) {
	env := resolved{client: n.Mail, source: SourceEnv, at: time.Now()}
	if n.Mail == nil {
		env.source = SourceOff
	}
	if n.DB == nil || n.Vault == nil {
		return env, nil
	}
	s, ok, err := loadStored(ctx, n.DB.Pool, false)
	if err != nil || !ok {
		return env, err
	}
	key, err := n.Vault.Open(s.sealed, settingsSealAD)
	if err != nil {
		return env, fmt.Errorf("saved email key does not decrypt; is CREDENTIALS_KEY the one it was saved with? %w", err)
	}
	return resolved{client: resend.New(n.ResendURL, key, s.from), source: SourceSettings, at: env.at}, nil
}

// refresh reads the settings now and remembers the answer. When the read fails it keeps the last
// good answer, so a database hiccup does not turn email off.
func (n *Notifications) refresh(ctx context.Context) resolved {
	r, err := n.load(ctx)
	n.mu.Lock()
	defer n.mu.Unlock()
	if err != nil {
		n.Log.Error("email settings not read", "err", err)
		if !n.current.at.IsZero() {
			return n.current
		}
	}
	n.current = r
	return r
}

// resolve returns the client to send with, read afresh once settingsTTL has passed.
func (n *Notifications) resolve() resolved {
	n.mu.Lock()
	r := n.current
	n.mu.Unlock()
	if !r.at.IsZero() && time.Since(r.at) < settingsTTL {
		return r
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return n.refresh(ctx)
}

// Source says where email comes from now: settings, env or off.
func (n *Notifications) Source() string { return n.resolve().source }

// GetEmailSettings reports the saved settings and the source in use.
func (n *Notifications) GetEmailSettings(ctx context.Context) (EmailSettings, error) {
	r := n.refresh(ctx)
	out := EmailSettings{Provider: providerResend, Source: r.source}
	s, ok, err := loadStored(ctx, n.DB.Pool, false)
	if err != nil {
		return out, err
	}
	switch {
	case ok:
		out.From, out.KeySet, out.KeyLast4 = s.from, true, s.last4
		at := s.updatedAt.UTC().Format(time.RFC3339)
		out.UpdatedAt, out.UpdatedBy = &at, &s.updatedBy
	case n.Mail != nil:
		out.From, out.KeySet, out.KeyLast4 = n.Mail.From, true, lastFour(n.Mail.Key)
	}
	return out, nil
}

// SaveEmailSettings stores the from address and, when given, a new key. The first save needs a key.
func (n *Notifications) SaveEmailSettings(ctx context.Context, m kernel.Meta, in EmailSettingsInput) (EmailSettings, error) {
	from, key := strings.TrimSpace(in.From), strings.TrimSpace(in.Key)
	if err := checkFrom(from); err != nil {
		return EmailSettings{}, err
	}
	if n.Vault == nil {
		return EmailSettings{}, errors.New("no vault to encrypt the email key")
	}
	err := pgx.BeginFunc(ctx, n.DB.Pool, func(tx pgx.Tx) error {
		old, exists, err := loadStored(ctx, tx, true)
		if err != nil {
			return err
		}
		if key == "" && !exists {
			return kernel.Invalid{Reason: "Enter the Resend API key."}
		}
		if key != "" {
			sealed, err := n.Vault.Seal(key, settingsSealAD)
			if err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `insert into email_settings (provider, ciphertext, last4, from_address, updated_by, updated_at)
				values ($1, $2, $3, $4, $5, $6)
				on conflict (id) do update set provider = excluded.provider, ciphertext = excluded.ciphertext, last4 = excluded.last4,
					from_address = excluded.from_address, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
				providerResend, sealed, lastFour(key), from, m.By(), m.At); err != nil {
				return err
			}
			if err := kernel.LogCredential(ctx, tx, m, settingsAudit, "Resend API key", "updated"); err != nil {
				return err
			}
		} else if from != old.from {
			if _, err := tx.Exec(ctx, `update email_settings set from_address = $1, updated_by = $2, updated_at = $3`, from, m.By(), m.At); err != nil {
				return err
			}
		}
		if from != old.from {
			return kernel.LogCredential(ctx, tx, m, settingsAudit, "Email from address", "set to "+from)
		}
		return nil
	})
	if err != nil {
		return EmailSettings{}, err
	}
	return n.GetEmailSettings(ctx)
}

// SendTest sends one email to the given address with the client in use, and reports Resend's answer.
func (n *Notifications) SendTest(ctx context.Context, to string) EmailTestResult {
	out := EmailTestResult{To: to}
	r := n.refresh(ctx)
	if r.client == nil {
		out.Error = "Email is off. Save an API key and a from address first."
		return out
	}
	sendCtx, cancel := context.WithTimeout(ctx, sendTimeout)
	defer cancel()
	err := r.client.Send(sendCtx, resend.Message{
		To:      to,
		Subject: "Commerce OS test email",
		Text:    "This test shows that Commerce OS can send email from " + r.client.From + ".\n",
		HTML:    "<p>This test shows that Commerce OS can send email.</p>",
	})
	if err == nil {
		out.Ok = true
		return out
	}
	out.Error = err.Error()
	var refused *resend.Error
	if errors.As(err, &refused) && refused.Detail != "" {
		out.Error += ": " + refused.Detail
	}
	// Resend never echoes the key, but a key must not reach the console even if it did.
	out.Error = strings.ReplaceAll(out.Error, r.client.Key, "[key]")
	return out
}

// checkFrom accepts "name@domain.tld" or "Name <name@domain.tld>".
func checkFrom(from string) error {
	invalid := kernel.Invalid{Reason: "Enter the from address as name@your-domain.com or Name <name@your-domain.com>."}
	addr, err := mail.ParseAddress(from)
	if err != nil {
		return invalid
	}
	_, domain, _ := strings.Cut(addr.Address, "@")
	if !strings.Contains(strings.Trim(domain, "."), ".") {
		return invalid
	}
	return nil
}

// lastFour shows the end of a key long enough to keep the rest hidden.
func lastFour(key string) string {
	r := []rune(key)
	if len(r) <= 8 {
		return ""
	}
	return string(r[len(r)-4:])
}
