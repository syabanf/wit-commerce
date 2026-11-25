package notifications

import (
	"context"
	"net/url"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/mail"
)

// ForgetCustomer removes what email holds about an erased customer: their links, the email still
// waiting to go to them, and their address on email already sent.
func ForgetCustomer(ctx context.Context, tx pgx.Tx, customerID, email string) error {
	if _, err := tx.Exec(ctx, `delete from email_tokens where subject_type = $1 and subject_id = $2`, subjectCustomer, customerID); err != nil {
		return err
	}
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return nil
	}
	if _, err := tx.Exec(ctx, `delete from email_outbox where lower("to") = $1 and sent_at is null`, email); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `update email_outbox set "to" = 'erased', subject = '', html = '', text = '', headers = '{}' where lower("to") = $1`, email)
	return err
}

// UnsubscribeURL is the public page that ends a shopper's marketing email.
func (n *Notifications) UnsubscribeURL(token string) string {
	return n.PublicURL + "/api/v1/unsubscribe?token=" + url.QueryEscape(token)
}

// ComposeMarketing lays out a marketing email. It takes the unsubscribe link as a required
// argument, so no marketing email goes out without one. Callers pick recipients with
// rules.MarketingAllowed. lang is the store's language, as in ShopperFacts.
func ComposeMarketing(b Branding, lang, to string, e Email, unsubscribeURL string) mail.Message {
	e.Unsubscribe = &Link{Label: Say(lang, "unsubscribe"), URL: unsubscribeURL}
	if e.Footer == "" {
		e.Footer = Say(lang, "marketing.footer", b.Name)
	}
	body, text := Render(b, e)
	return mail.Message{To: to, Subject: e.Title, Text: text, HTML: body, Headers: ListUnsubscribe(unsubscribeURL, b.Contact)}
}

// ListUnsubscribe is the header pair mail apps use for their own unsubscribe button (RFC 2369 and
// RFC 8058): the HTTPS link, which takes the one-click POST, and a mailto when the brand has an
// address.
func ListUnsubscribe(unsubscribeURL, mailbox string) map[string]string {
	value := "<" + unsubscribeURL + ">"
	if mailbox = strings.TrimSpace(mailbox); mailbox != "" {
		value += ", <mailto:" + mailbox + "?subject=unsubscribe>"
	}
	return map[string]string{"List-Unsubscribe": value, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}
}
