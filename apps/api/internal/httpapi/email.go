package httpapi

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/crm"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/notifications"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/orders"
	"github.com/syabanf/wit-commerce/apps/api/internal/readmodel"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

const mailRatePerEmail = 3

// errLinkExpired answers a link that was used before, has expired, or names a missing record.
var errLinkExpired = staffError{http.StatusGone, "LINK_EXPIRED", "This link has expired or was already used. Ask for a new one."}

// linkError turns the notifications module's refusal into the answer the client reads.
func linkError(err error) error {
	if errors.Is(err, notifications.ErrLinkExpired) {
		return errLinkExpired
	}
	return err
}

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

// emailOn answers when no email service is set up, which says nothing about any one account.
func (s *Server) emailOn(w http.ResponseWriter) bool {
	if !s.notify.On() {
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
		s.notify.MailUserReset(r.Context(), u)
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
		id, err := notifications.RedeemUserLink(r.Context(), tx, in.Token)
		if err != nil {
			return linkError(err)
		}
		u, err := store.Get[domain.User](r.Context(), tx, "users", id)
		if err != nil || u.Disabled {
			return errLinkExpired
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

// mailInvite and mailAdminReset send while the admin waits, so the admin hears if the send failed.
func (s *Server) mailInvite(ctx context.Context, u domain.User) bool {
	return s.mailAllowed(u.Email) && s.notify.MailInvite(ctx, u)
}

func (s *Server) mailAdminReset(ctx context.Context, u domain.User) bool {
	return s.mailAllowed(u.Email) && s.notify.MailAdminReset(ctx, u)
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
		s.notify.MailCustomerReset(r.Context(), tenant, id, email)
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
		id, err := notifications.RedeemCustomerReset(r.Context(), tx, in.Token)
		if err != nil {
			return linkError(err)
		}
		c, err := store.Get[domain.Customer](r.Context(), tx, "customers", id)
		if err != nil || c.TenantID != tenant.ID {
			return errLinkExpired
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
	if !s.notify.On() || !s.mailAllowed(tenant.ID+c.Email) {
		return
	}
	s.notify.MailVerify(ctx, tenant, c)
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
		id, err := notifications.RedeemCustomerVerify(r.Context(), tx, in.Token)
		if err != nil {
			return linkError(err)
		}
		c, err := store.Get[domain.Customer](r.Context(), tx, "customers", id)
		if err != nil || c.TenantID != tenant.ID {
			return errLinkExpired
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
// The HTTP layer runs it because it spans owners: orders and crm move their own rows, and this
// layer owns customer_credentials and refreshes the read models.
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
		if err := orders.ReassignCustomer(ctx, tx, guest, c.ID); err != nil {
			return err
		}
		if err := crm.MergeGuest(ctx, tx, &c, guest); err != nil {
			return err
		}
	}
	if err := crm.SaveMerged(ctx, tx, c); err != nil {
		return err
	}
	// These writes bypass the service, so they project the moved orders and metrics themselves.
	if err := readmodel.RefreshCustomers(ctx, tx, []string{c.ID}); err != nil {
		return err
	}
	if _, err := readmodel.RefreshCustomerMetrics(ctx, tx, append(guests, c.ID)); err != nil {
		return err
	}
	// The moved orders now name another customer, which the seller buyer facts count.
	tenants, days, err := readmodel.SalesDaysOf(ctx, tx, "o.customer_id = $1", c.ID)
	if err != nil {
		return err
	}
	_, _, err = readmodel.RefreshSalesDays(ctx, tx, tenants, days)
	return err
}
