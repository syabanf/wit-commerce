package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

const (
	passwordMin        = 10
	passwordMax        = 200
	signInRatePerIP    = 30
	signInRatePerEmail = 10
)

type changePasswordInput struct {
	// CurrentPassword may be empty for a shopper setting their first password.
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

// tokenResponse replaces the caller's token after a password change ended their other sessions.
type tokenResponse struct {
	Token string `json:"token"`
}

type registerInput struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Password string `json:"password"`
}

type shopperResponse struct {
	Token     string          `json:"token"`
	ExpiresAt string          `json:"expiresAt"`
	Customer  domain.Customer `json:"customer"`
}

// decoyHash lets an unknown email cost the same as a wrong password, so timing does not reveal
// which emails have accounts.
var decoyHash = sync.OnceValue(func() string {
	hash, _ := auth.HashPassword("no account has this password")
	return hash
})

func normalEmail(email string) string { return strings.ToLower(strings.TrimSpace(email)) }

// signInAllowed caps guesses per client and per email. The email cap holds when an attacker moves
// between addresses; the client cap holds when they move between emails.
func (s *Server) signInAllowed(w http.ResponseWriter, r *http.Request, email string) bool {
	if s.signInClients.allow(s.clientIP(r), w) && s.signInEmails.allow(normalEmail(email), w) {
		return true
	}
	writeProblem(w, http.StatusTooManyRequests, "RATE_LIMITED", "Too many attempts. Try again in a minute.")
	return false
}

func checkNewPassword(w http.ResponseWriter, password string) bool {
	if n := utf8.RuneCountInString(password); n < passwordMin || n > passwordMax {
		writeProblem(w, http.StatusUnprocessableEntity, "WEAK_PASSWORD", "Use a password of 10 to 200 characters.")
		return false
	}
	return true
}

// sellersOf lists a user's active seller profiles, so the seller app can open one after sign-in.
func (s *Server) sellersOf(ctx context.Context, userID string) ([]domain.Seller, error) {
	all, err := store.List[domain.Seller](ctx, s.DB.Pool, "sellers", "")
	if err != nil {
		return nil, err
	}
	mine := []domain.Seller{}
	for _, seller := range all {
		if seller.UserID != nil && *seller.UserID == userID && seller.Status != "suspended" {
			mine = append(mine, seller)
		}
	}
	return mine, nil
}

// changePassword needs the current password, so a stolen token alone cannot lock the owner out.
func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.From(r.Context())
	if p.Kind != auth.KindUser {
		writeProblem(w, http.StatusForbidden, "FORBIDDEN", "Only a signed-in person can change a password.")
		return
	}
	var in changePasswordInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	if !s.signInAllowed(w, r, p.ID) || !checkNewPassword(w, in.NewPassword) {
		return
	}
	var hash string
	err := s.DB.Pool.QueryRow(r.Context(), `select password_hash from credentials where user_id = $1`, p.ID).Scan(&hash)
	if err != nil || !auth.CheckPassword(hash, in.CurrentPassword) {
		writeProblem(w, http.StatusUnauthorized, "BAD_CREDENTIALS", "Your current password is not correct.")
		return
	}
	next, err := auth.HashPassword(in.NewPassword)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	now := time.Now()
	if _, err := s.DB.Pool.Exec(r.Context(), `update credentials set password_hash = $2, tokens_valid_from = $3, updated_at = now() where user_id = $1`,
		p.ID, next, now.Truncate(time.Second)); err != nil {
		s.writeError(w, r, err)
		return
	}
	// Other sessions end here; this one continues on a new token.
	token, _, err := s.Signer.Sign(auth.Principal{Kind: p.Kind, ID: p.ID, Role: p.Role, TenantIDs: p.TenantIDs}, now)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, tokenResponse{Token: token})
}

func (s *Server) issueShopper(w http.ResponseWriter, customer domain.Customer) {
	p := auth.Principal{Kind: auth.KindCustomer, ID: customer.ID, TenantID: customer.TenantID}
	token, exp, err := s.Signer.Sign(p, time.Now())
	if err != nil {
		writeProblem(w, http.StatusInternalServerError, "INTERNAL", "Could not sign the token.")
		return
	}
	writeJSON(w, http.StatusOK, shopperResponse{Token: token, ExpiresAt: exp.UTC().Format(time.RFC3339), Customer: customer})
}

func (s *Server) shopLogin(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	var in loginInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	if !s.signInAllowed(w, r, in.Email) {
		return
	}
	var id, hash string
	err = s.DB.Pool.QueryRow(r.Context(), `select c.id, cc.password_hash from customers c
		join customer_credentials cc on cc.customer_id = c.id where c.tenant_id = $1 and c.email = $2`,
		tenant.ID, normalEmail(in.Email)).Scan(&id, &hash)
	if err != nil {
		hash = decoyHash()
	}
	if !auth.CheckPassword(hash, in.Password) || id == "" {
		writeProblem(w, http.StatusUnauthorized, "BAD_CREDENTIALS", "That email and password do not match.")
		return
	}
	customer, err := store.Get[domain.Customer](r.Context(), s.DB.Pool, "customers", id)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	s.issueShopper(w, customer)
}

func (s *Server) shopRegister(w http.ResponseWriter, r *http.Request) {
	tenant, err := s.storeTenant(r)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	var in registerInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	email := normalEmail(in.Email)
	if !s.signInAllowed(w, r, email) {
		return
	}
	name := strings.TrimSpace(in.Name)
	if address, err := mail.ParseAddress(email); err != nil || address.Address != email || name == "" || len(name) > 120 {
		writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "Enter your name and a valid email address.")
		return
	}
	if !checkNewPassword(w, in.Password) {
		return
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	d, customer, err := s.svc.RegisterCustomer(r.Context(), service.Meta{P: s.shopPrincipal(r, tenant.ID), At: s.Clock.NowIso()},
		tenant, name, email, strings.TrimSpace(in.Phone), hash)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	s.publish(d)
	s.sendVerifyEmail(r.Context(), tenant, customer)
	s.issueShopper(w, customer)
}

// shopPassword sets or changes the signed-in shopper's password. A guest holds a token from their
// first order and has no password yet; once one exists, changing it takes the current one.
func (s *Server) shopPassword(w http.ResponseWriter, r *http.Request) {
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
	var in changePasswordInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	if !s.signInAllowed(w, r, p.ID) || !checkNewPassword(w, in.NewPassword) {
		return
	}
	var hash string
	err = s.DB.Pool.QueryRow(r.Context(), `select password_hash from customer_credentials where customer_id = $1`, p.ID).Scan(&hash)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		var taken bool
		err := s.DB.Pool.QueryRow(r.Context(), `select exists (select 1 from customers c join customer_credentials cc on cc.customer_id = c.id
			where c.tenant_id = $1 and c.email = (select email from customers where id = $2))`, tenant.ID, p.ID).Scan(&taken)
		if err != nil {
			s.writeError(w, r, err)
			return
		}
		if taken {
			writeProblem(w, http.StatusConflict, "ACCOUNT_EXISTS", "An account with this email already exists. Sign in to it instead.")
			return
		}
	case err != nil:
		s.writeError(w, r, err)
		return
	case !auth.CheckPassword(hash, in.CurrentPassword):
		writeProblem(w, http.StatusUnauthorized, "BAD_CREDENTIALS", "Your current password is not correct.")
		return
	}
	next, err := auth.HashPassword(in.NewPassword)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	now := time.Now()
	if _, err := s.DB.Pool.Exec(r.Context(), `insert into customer_credentials (customer_id, password_hash, tokens_valid_from) values ($1, $2, $3)
		on conflict (customer_id) do update set password_hash = excluded.password_hash,
		tokens_valid_from = excluded.tokens_valid_from, updated_at = now()`, p.ID, next, now.Truncate(time.Second)); err != nil {
		s.writeError(w, r, err)
		return
	}
	token, _, err := s.Signer.Sign(auth.Principal{Kind: auth.KindCustomer, ID: p.ID, TenantID: tenant.ID}, now)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, tokenResponse{Token: token})
}
