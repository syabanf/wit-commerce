// Package notifications owns outgoing email and the single-use links it carries, kept in the
// email_tokens table, and the email setup a platform admin saves, kept in email_settings. It composes
// each message and sends it through Resend: at once when an admin waits for the answer, otherwise
// through the email_outbox queue that Drain empties.
package notifications

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"html"
	"log/slog"
	"net/url"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/mail"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

const (
	kindReset       = "reset"
	kindInvite      = "invite"
	kindVerify      = "verify"
	subjectUser     = "user"
	subjectCustomer = "customer"
	resetLifetime   = time.Hour
	verifyLifetime  = 24 * time.Hour
	inviteLifetime  = 7 * 24 * time.Hour
	sendTimeout     = 20 * time.Second
)

// ErrLinkExpired means a link was used before, has expired, or is of the wrong kind.
var ErrLinkExpired = errors.New("link expired or already used")

// Notifications sends email. Settings saved in the console pick the mail client; without them Mail,
// built from the environment, does; with neither email is off and nothing is queued. An empty
// PublicURL turns email off too. Drain needs no PublicURL, since queued rows hold the finished
// message. Runtime.Vault opens the saved key; without it only Mail counts.
type Notifications struct {
	*kernel.Runtime
	// Mail is the client from RESEND_API_KEY and EMAIL_FROM, or nil.
	Mail *mail.Client
	// ResendURL is where a client built from saved settings sends; empty means Resend itself.
	ResendURL string
	// PublicURL is the site's address, for links in email.
	PublicURL string
	// StoreRootDomain puts shopper links on the store's own host (lari.commerce.reddie.id); empty
	// keeps them at PublicURL/shop/{subdomain}.
	StoreRootDomain string
	Log             *slog.Logger

	mu      sync.Mutex
	current resolved
}

// On reports whether email can go out.
func (n *Notifications) On() bool { return n.PublicURL != "" && n.resolve().client != nil }

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// addToken stores a new link beside any earlier ones.
func addToken(ctx context.Context, q store.Querier, kind, subjectType, subjectID string, lifetime time.Duration) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	_, err := q.Exec(ctx, `insert into email_tokens (hash, kind, subject_type, subject_id, expires_at) values ($1, $2, $3, $4, $5)`,
		hashToken(token), kind, subjectType, subjectID, time.Now().Add(lifetime))
	return token, err
}

// retireOtherTokens leaves token as the only working link of its kind.
func retireOtherTokens(ctx context.Context, q store.Querier, kind, subjectType, subjectID, token string) error {
	_, err := q.Exec(ctx, `delete from email_tokens where subject_type = $1 and subject_id = $2 and kind = $3 and hash <> $4`,
		subjectType, subjectID, kind, hashToken(token))
	return err
}

// issueToken replaces any earlier unused link of this kind, so only the newest one works.
func issueToken(ctx context.Context, q store.Querier, kind, subjectType, subjectID string, lifetime time.Duration) (string, error) {
	token, err := addToken(ctx, q, kind, subjectType, subjectID, lifetime)
	if err != nil {
		return "", err
	}
	return token, retireOtherTokens(ctx, q, kind, subjectType, subjectID, token)
}

// useToken spends a link once; a second use, an expired link or the wrong kind finds nothing.
func useToken(ctx context.Context, tx pgx.Tx, token, subjectType string, kinds ...string) (string, error) {
	var id string
	err := tx.QueryRow(ctx, `update email_tokens set used_at = now()
		where hash = $1 and kind = any($2) and subject_type = $3 and used_at is null and expires_at > now() returning subject_id`,
		hashToken(token), kinds, subjectType).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrLinkExpired
	}
	return id, err
}

// RedeemUserLink spends a staff reset or invitation link and returns the user id.
func RedeemUserLink(ctx context.Context, tx pgx.Tx, token string) (string, error) {
	return useToken(ctx, tx, token, subjectUser, kindReset, kindInvite)
}

// RedeemUserVerify spends a store owner's email confirmation link and returns the user id.
func RedeemUserVerify(ctx context.Context, tx pgx.Tx, token string) (string, error) {
	return useToken(ctx, tx, token, subjectUser, kindVerify)
}

// RedeemCustomerReset spends a shopper's reset link and returns the customer id.
func RedeemCustomerReset(ctx context.Context, tx pgx.Tx, token string) (string, error) {
	return useToken(ctx, tx, token, subjectCustomer, kindReset)
}

// RedeemCustomerVerify spends a shopper's email confirmation link and returns the customer id.
func RedeemCustomerVerify(ctx context.Context, tx pgx.Tx, token string) (string, error) {
	return useToken(ctx, tx, token, subjectCustomer, kindVerify)
}

func linkMessage(to, subject, intro, action, link string) mail.Message {
	note := "If you did not ask for this, you can ignore this email."
	return mail.Message{
		To:      to,
		Subject: subject,
		Text:    fmt.Sprintf("%s\n\n%s: %s\n\n%s\n", intro, action, link, note),
		HTML: fmt.Sprintf(`<p>%s</p><p><a href="%s">%s</a></p><p>%s</p>`,
			html.EscapeString(intro), html.EscapeString(link), html.EscapeString(action), html.EscapeString(note)),
	}
}

// queueLink replaces earlier links of the kind and queues an email with the new one, both in one
// transaction: the link exists only if its email will go out. The caller answers without waiting
// for Resend, so the time to respond does not reveal whether an email has an account. A failure goes
// to the log without the message, which holds a working link.
func (n *Notifications) queueLink(ctx context.Context, kind, subjectType, subjectID string, lifetime time.Duration, compose func(token string) mail.Message) {
	if !n.On() {
		return
	}
	err := pgx.BeginFunc(ctx, n.DB.Pool, func(tx pgx.Tx) error {
		token, err := issueToken(ctx, tx, kind, subjectType, subjectID, lifetime)
		if err != nil {
			return err
		}
		return enqueue(ctx, tx, subjectType+"_"+kind, compose(token))
	})
	if err != nil {
		n.Log.Error("email not queued", "err", err, "kind", subjectType+"_"+kind)
	}
}

func (n *Notifications) storeLink(tenant domain.Tenant, param, token string) string {
	return domain.StoreLink(tenant, n.StoreRootDomain, n.PublicURL) + "/account?" + param + "=" + url.QueryEscape(token)
}

// MailUserReset queues for a staff member the link from "forgot password".
func (n *Notifications) MailUserReset(ctx context.Context, u domain.User) {
	n.queueLink(ctx, kindReset, subjectUser, u.ID, resetLifetime, func(token string) mail.Message {
		link := n.PublicURL + "/reset-password?token=" + url.QueryEscape(token)
		return linkMessage(u.Email, "Reset your Commerce OS password", "Use this link within an hour to choose a new password.", "Choose a new password", link)
	})
}

// MailUserVerify queues for a new store owner a link that proves the inbox.
func (n *Notifications) MailUserVerify(ctx context.Context, u domain.User) {
	n.queueLink(ctx, kindVerify, subjectUser, u.ID, verifyLifetime, func(token string) mail.Message {
		link := n.PublicURL + "/verify-email?token=" + url.QueryEscape(token)
		return linkMessage(u.Email, "Confirm your email for Commerce OS", "Confirm this email within 24 hours so you can publish your store.", "Confirm my email", link)
	})
}

// MailCustomerReset queues for a shopper the link from "forgot password" at the tenant's store.
func (n *Notifications) MailCustomerReset(ctx context.Context, tenant domain.Tenant, customerID, email string) {
	n.queueLink(ctx, kindReset, subjectCustomer, customerID, resetLifetime, func(token string) mail.Message {
		return linkMessage(email, "Reset your "+tenant.Name+" password", "Use this link within an hour to choose a new password.", "Choose a new password", n.storeLink(tenant, "reset", token))
	})
}

// MailVerify queues for a shopper a link that proves the inbox.
func (n *Notifications) MailVerify(ctx context.Context, tenant domain.Tenant, c domain.Customer) {
	n.queueLink(ctx, kindVerify, subjectCustomer, c.ID, verifyLifetime, func(token string) mail.Message {
		return linkMessage(c.Email, "Confirm your email at "+tenant.Name, "Confirm this email to bring your earlier guest orders into your account.", "Confirm my email", n.storeLink(tenant, "verify", token))
	})
}

// mailStaffLink sends a link to a staff member while the admin waits, so the admin hears if it
// failed. It skips the outbox on purpose: the admin needs the answer now, and a queued send could
// only report "queued". Nothing here reveals an account: the admin already chose this person.
func (n *Notifications) mailStaffLink(ctx context.Context, u domain.User, kind string, lifetime time.Duration, subject, intro, action, query string) bool {
	client := n.resolve().client
	if client == nil {
		return false
	}
	token, err := addToken(ctx, n.DB.Pool, kind, subjectUser, u.ID, lifetime)
	if err != nil {
		n.Log.Error("staff link not issued", "err", err)
		return false
	}
	sendCtx, cancel := context.WithTimeout(ctx, sendTimeout)
	defer cancel()
	link := n.PublicURL + "/reset-password?token=" + url.QueryEscape(token) + query
	if err := client.Send(sendCtx, linkMessage(u.Email, subject, intro, action, link)); err != nil {
		// The earlier link is the only one the person holds, so a failed send must not end it.
		n.Log.Error("email not sent", "err", err, "subject", subject)
		if _, err := n.DB.Pool.Exec(ctx, `delete from email_tokens where hash = $1`, hashToken(token)); err != nil {
			n.Log.Error("unsent link not removed", "err", err)
		}
		return false
	}
	if err := retireOtherTokens(ctx, n.DB.Pool, kind, subjectUser, u.ID, token); err != nil {
		n.Log.Error("earlier links not retired", "err", err)
	}
	return true
}

// MailInvite sends a new staff member the link to choose a first password, and reports whether it went out.
func (n *Notifications) MailInvite(ctx context.Context, u domain.User) bool {
	return n.mailStaffLink(ctx, u, kindInvite, inviteLifetime, "You are invited to Commerce OS",
		"An admin added you to Commerce OS. Use this link within 7 days to choose your password.", "Choose your password", "&invite=1")
}

// MailAdminReset sends a staff member whose password an admin ended the link to choose a new one.
func (n *Notifications) MailAdminReset(ctx context.Context, u domain.User) bool {
	return n.mailStaffLink(ctx, u, kindReset, resetLifetime, "An admin reset your Commerce OS password",
		"An admin reset your password. Use this link within an hour to choose a new one.", "Choose a new password", "")
}
