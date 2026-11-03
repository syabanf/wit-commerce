package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"html"
	"net/http"
	"net/url"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/mail"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

const (
	kindReset        = "reset"
	kindInvite       = "invite"
	kindVerify       = "verify"
	subjectUser      = "user"
	subjectCustomer  = "customer"
	resetLifetime    = time.Hour
	verifyLifetime   = 24 * time.Hour
	inviteLifetime   = 7 * 24 * time.Hour
	mailRatePerEmail = 3
)

type forgotInput struct {
	Email string `json:"email"`
}

type resetInput struct {
	Token       string `json:"token"`
	NewPassword string `json:"newPassword"`
}

type verifyInput struct {
	Token string `json:"token"`
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// addToken stores a new link beside any earlier ones.
func (s *Server) addToken(ctx context.Context, kind, subjectType, subjectID string, lifetime time.Duration) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	_, err := s.DB.Pool.Exec(ctx, `insert into email_tokens (hash, kind, subject_type, subject_id, expires_at) values ($1, $2, $3, $4, $5)`,
		hashToken(token), kind, subjectType, subjectID, time.Now().Add(lifetime))
	return token, err
}

// retireOtherTokens leaves token as the only working link of its kind.
func (s *Server) retireOtherTokens(ctx context.Context, kind, subjectType, subjectID, token string) error {
	_, err := s.DB.Pool.Exec(ctx, `delete from email_tokens where subject_type = $1 and subject_id = $2 and kind = $3 and hash <> $4`,
		subjectType, subjectID, kind, hashToken(token))
	return err
}

// issueToken replaces any earlier unused link of this kind, so only the newest one works.
func (s *Server) issueToken(ctx context.Context, kind, subjectType, subjectID string, lifetime time.Duration) (string, error) {
	token, err := s.addToken(ctx, kind, subjectType, subjectID, lifetime)
	if err != nil {
		return "", err
	}
	return token, s.retireOtherTokens(ctx, kind, subjectType, subjectID, token)
}

// useToken spends a link once; a second use, an expired link or the wrong kind finds nothing.
func useToken(ctx context.Context, tx pgx.Tx, token, subjectType string, kinds ...string) (string, error) {
	var id string
	err := tx.QueryRow(ctx, `update email_tokens set used_at = now()
		where hash = $1 and kind = any($2) and subject_type = $3 and used_at is null and expires_at > now() returning subject_id`,
		hashToken(token), kinds, subjectType).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", staffError{http.StatusGone, "LINK_EXPIRED", "This link has expired or was already used. Ask for a new one."}
	}
	return id, err
}

// sendLater answers the request first, so the time to respond does not reveal whether an email
// has an account. A failure goes to the log without the message, which holds a working link.
func (s *Server) sendLater(m mail.Message) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		if err := s.Mail.Send(ctx, m); err != nil {
			s.Log.Error("email not sent", "err", err, "subject", m.Subject)
		}
	}()
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

// emailOn answers when no email service is set up, which says nothing about any one account.
func (s *Server) emailOn(w http.ResponseWriter) bool {
	if s.Mail == nil || s.PublicURL == "" {
		writeProblem(w, http.StatusServiceUnavailable, "EMAIL_OFF", "Email is not set up yet. Contact the store or your admin.")
		return false
	}
	return true
}

// forgotAllowed caps requests per client out loud, and per email in silence: a mailbox gets at most
// three a minute, and a refusal there must not reveal that the address has an account.
func (s *Server) forgotAllowed(w http.ResponseWriter, r *http.Request) bool {
	if s.signInClients.allow(s.clientIP(r), w) {
		return true
	}
	writeProblem(w, http.StatusTooManyRequests, "RATE_LIMITED", "Too many attempts. Try again in a minute.")
	return false
}

func (s *Server) mailAllowed(email string) bool {
	return s.mailEmails.allow(email, discardHeaders{})
}

type discardHeaders struct{}

func (discardHeaders) Header() http.Header       { return http.Header{} }
func (discardHeaders) Write([]byte) (int, error) { return 0, nil }
func (discardHeaders) WriteHeader(int)           {}

func accepted(w http.ResponseWriter) {
	writeJSON(w, http.StatusAccepted, map[string]string{"message": "If this email has an account, a link is on its way."})
}

func (s *Server) forgotPassword(w http.ResponseWriter, r *http.Request) {
	if !s.emailOn(w) || !s.forgotAllowed(w, r) {
		return
	}
	var in forgotInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	email := normalEmail(in.Email)
	u, _, err := s.userByEmail(r.Context(), email)
	if err == nil && !u.Disabled && s.mailAllowed(email) {
		token, err := s.issueToken(r.Context(), kindReset, subjectUser, u.ID, resetLifetime)
		if err != nil {
			s.Log.Error("reset link not issued", "err", err)
		} else {
			link := s.PublicURL + "/reset-password?token=" + url.QueryEscape(token)
			s.sendLater(linkMessage(u.Email, "Reset your Commerce OS password", "Use this link within an hour to choose a new password.", "Choose a new password", link))
		}
	}
	accepted(w)
}

func (s *Server) resetPassword(w http.ResponseWriter, r *http.Request) {
	if !s.forgotAllowed(w, r) {
		return
	}
	var in resetInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	if !checkNewPassword(w, in.NewPassword) {
		return
	}
	hash, err := auth.HashPassword(in.NewPassword)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	err = pgx.BeginFunc(r.Context(), s.DB.Pool, func(tx pgx.Tx) error {
		id, err := useToken(r.Context(), tx, in.Token, subjectUser, kindReset, kindInvite)
		if err != nil {
			return err
		}
		u, err := store.Get[domain.User](r.Context(), tx, "users", id)
		if err != nil || u.Disabled {
			return staffError{http.StatusGone, "LINK_EXPIRED", "This link has expired or was already used. Ask for a new one."}
		}
		action := "password_reset_by_link"
		if u.Invited {
			action = "invite_accepted"
			u.Invited = false
			if err := store.Put(r.Context(), tx, "users", id, u); err != nil {
				return err
			}
		}
		if err := (staffEvent{action: action, target: u, tenantIDs: u.TenantIDs}).record(r.Context(), tx, id); err != nil {
			return err
		}
		_, err = tx.Exec(r.Context(), `insert into credentials (user_id, password_hash, tokens_valid_from) values ($1, $2, $3)
			on conflict (user_id) do update set password_hash = excluded.password_hash,
			tokens_valid_from = excluded.tokens_valid_from, updated_at = now()`, id, hash, time.Now().Truncate(time.Second))
		return err
	})
	if err != nil {
		s.writeStaffError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// mailStaffLink sends a link to a staff member while the admin waits, so the admin hears if it
// failed. Nothing here reveals an account: the admin already chose this person.
func (s *Server) mailStaffLink(ctx context.Context, u domain.User, kind string, lifetime time.Duration, subject, intro, action, query string) bool {
	if !s.mailAllowed(u.Email) {
		return false
	}
	token, err := s.addToken(ctx, kind, subjectUser, u.ID, lifetime)
	if err != nil {
		s.Log.Error("staff link not issued", "err", err)
		return false
	}
	sendCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	link := s.PublicURL + "/reset-password?token=" + url.QueryEscape(token) + query
	if err := s.Mail.Send(sendCtx, linkMessage(u.Email, subject, intro, action, link)); err != nil {
		// The earlier link is the only one the person holds, so a failed send must not end it.
		s.Log.Error("email not sent", "err", err, "subject", subject)
		if _, err := s.DB.Pool.Exec(ctx, `delete from email_tokens where hash = $1`, hashToken(token)); err != nil {
			s.Log.Error("unsent link not removed", "err", err)
		}
		return false
	}
	if err := s.retireOtherTokens(ctx, kind, subjectUser, u.ID, token); err != nil {
		s.Log.Error("earlier links not retired", "err", err)
	}
	return true
}

func (s *Server) mailInvite(ctx context.Context, u domain.User) bool {
	return s.mailStaffLink(ctx, u, kindInvite, inviteLifetime, "You are invited to Commerce OS",
		"An admin added you to Commerce OS. Use this link within 7 days to choose your password.", "Choose your password", "&invite=1")
}

func (s *Server) mailAdminReset(ctx context.Context, u domain.User) bool {
	return s.mailStaffLink(ctx, u, kindReset, resetLifetime, "An admin reset your Commerce OS password",
		"An admin reset your password. Use this link within an hour to choose a new one.", "Choose a new password", "")
}

func (s *Server) storeLink(tenant domain.Tenant, param, token string) string {
	return s.PublicURL + "/shop/" + tenant.Subdomain + "/account?" + param + "=" + url.QueryEscape(token)
}

// shopForgot also serves a guest from checkout: the link proves the inbox, so it may set the first
// password on that record. An account with a password goes first when both exist.
func (s *Server) shopForgot(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if !s.emailOn(w) || !s.forgotAllowed(w, r) {
		return
	}
	var in forgotInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	email := normalEmail(in.Email)
	var id string
	err = s.DB.Pool.QueryRow(r.Context(), `select c.id from customers c left join customer_credentials cc on cc.customer_id = c.id
		where c.tenant_id = $1 and c.email = $2 order by cc.customer_id is null limit 1`, tenant.ID, email).Scan(&id)
	if err == nil && s.mailAllowed(tenant.ID+email) {
		token, err := s.issueToken(r.Context(), kindReset, subjectCustomer, id, resetLifetime)
		if err != nil {
			s.Log.Error("reset link not issued", "err", err)
		} else {
			s.sendLater(linkMessage(email, "Reset your "+tenant.Name+" password", "Use this link within an hour to choose a new password.", "Choose a new password", s.storeLink(tenant, "reset", token)))
		}
	}
	accepted(w)
}

func (s *Server) shopReset(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if !s.forgotAllowed(w, r) {
		return
	}
	var in resetInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	if !checkNewPassword(w, in.NewPassword) {
		return
	}
	hash, err := auth.HashPassword(in.NewPassword)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	err = pgx.BeginFunc(r.Context(), s.DB.Pool, func(tx pgx.Tx) error {
		id, err := useToken(r.Context(), tx, in.Token, subjectCustomer, kindReset)
		if err != nil {
			return err
		}
		c, err := store.Get[domain.Customer](r.Context(), tx, "customers", id)
		if err != nil || c.TenantID != tenant.ID {
			return staffError{http.StatusGone, "LINK_EXPIRED", "This link has expired or was already used. Ask for a new one."}
		}
		// Reading the email proved the inbox, which is what verifying asks for.
		if _, err := tx.Exec(r.Context(), `insert into customer_credentials (customer_id, password_hash, tokens_valid_from) values ($1, $2, $3)
			on conflict (customer_id) do update set password_hash = excluded.password_hash,
			tokens_valid_from = excluded.tokens_valid_from, updated_at = now()`, id, hash, time.Now().Truncate(time.Second)); err != nil {
			return err
		}
		return claimGuestRecords(r.Context(), tx, c)
	})
	if err != nil {
		s.writeStaffError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// sendVerifyEmail mails the signed-in shopper a link that proves the inbox.
func (s *Server) sendVerifyEmail(ctx context.Context, tenant domain.Tenant, c domain.Customer) {
	if s.Mail == nil || s.PublicURL == "" || !s.mailAllowed(tenant.ID+c.Email) {
		return
	}
	token, err := s.issueToken(ctx, kindVerify, subjectCustomer, c.ID, verifyLifetime)
	if err != nil {
		s.Log.Error("verify link not issued", "err", err)
		return
	}
	s.sendLater(linkMessage(c.Email, "Confirm your email at "+tenant.Name, "Confirm this email to bring your earlier guest orders into your account.", "Confirm my email", s.storeLink(tenant, "verify", token)))
}

func (s *Server) shopSendVerify(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	p, ok := s.shopper(r, tenant.ID)
	if !ok {
		writeProblem(w, http.StatusUnauthorized, "UNAUTHENTICATED", "Sign in first.")
		return
	}
	if !s.emailOn(w) {
		return
	}
	c, err := store.Get[domain.Customer](r.Context(), s.DB.Pool, "customers", p.ID)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	s.sendVerifyEmail(r.Context(), tenant, c)
	accepted(w)
}

func (s *Server) shopVerify(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if !s.forgotAllowed(w, r) {
		return
	}
	var in verifyInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	err = pgx.BeginFunc(r.Context(), s.DB.Pool, func(tx pgx.Tx) error {
		id, err := useToken(r.Context(), tx, in.Token, subjectCustomer, kindVerify)
		if err != nil {
			return err
		}
		c, err := store.Get[domain.Customer](r.Context(), tx, "customers", id)
		if err != nil || c.TenantID != tenant.ID {
			return staffError{http.StatusGone, "LINK_EXPIRED", "This link has expired or was already used. Ask for a new one."}
		}
		return claimGuestRecords(r.Context(), tx, c)
	})
	if err != nil {
		s.writeStaffError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// claimGuestRecords marks the inbox proven and folds guest records with this email into the account:
// their orders, history, leads, tickets and points. Only a proven inbox gets here.
func claimGuestRecords(ctx context.Context, tx pgx.Tx, c domain.Customer) error {
	if _, err := tx.Exec(ctx, `update customer_credentials set email_verified_at = now() where customer_id = $1`, c.ID); err != nil {
		return err
	}
	rows, err := tx.Query(ctx, `select g.id from customers g where g.tenant_id = $1 and g.email = $2 and g.id <> $3
		and not exists (select 1 from customer_credentials cc where cc.customer_id = g.id)`, c.TenantID, normalEmail(c.Email), c.ID)
	if err != nil {
		return err
	}
	var guests []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		guests = append(guests, id)
	}
	rows.Close()
	if len(guests) == 0 {
		return nil
	}
	for _, guest := range guests {
		g, err := store.Get[domain.Customer](ctx, tx, "customers", guest)
		if err != nil {
			return err
		}
		c.Points += g.Points
		for _, table := range []string{"orders", "customer_events", "leads", "tickets"} {
			if _, err := tx.Exec(ctx, `update `+table+` set data = jsonb_set(data, '{customerId}', to_jsonb($1::text)) where data->>'customerId' = $2`, c.ID, guest); err != nil {
				return err
			}
		}
		if err := store.Delete(ctx, tx, "customers", guest); err != nil {
			return err
		}
	}
	return store.Put(ctx, tx, "customers", c.ID, c)
}
