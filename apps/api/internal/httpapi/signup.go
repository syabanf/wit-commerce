package httpapi

import (
	"net/http"
	"net/mail"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/identity"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/notifications"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

const (
	signUpRatePerIP    = 5
	signUpRatePerEmail = 3
	// subdomainChecksPerIP allows a check per keystroke pause while someone types a name.
	subdomainChecksPerIP = 60
)

type signUpInput struct {
	StoreName  string `json:"storeName"`
	Subdomain  string `json:"subdomain"`
	Industry   string `json:"industry"`
	TemplateID string `json:"templateId"`
	OwnerName  string `json:"ownerName"`
	Email      string `json:"email"`
	Password   string `json:"password"`
	// Website is a field people never see; only a bot fills it.
	Website string `json:"website"`
}

// signUp creates a store and its owner, and signs the owner in. A filled honeypot answers 422 with
// the same sentence as any other refusal: a silent success would leave a person whose browser
// filled the field believing they had a store, and the bot learns nothing it could not guess.
func (s *Server) signUp(w http.ResponseWriter, r *http.Request) {
	var in signUpInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	email := normalEmail(in.Email)
	if !s.signUpClients.allow(s.clientIP(r), w) || !s.signUpEmails.allow(email, w) {
		writeProblem(w, http.StatusTooManyRequests, "RATE_LIMITED", "Too many sign-ups from here. Try again in an hour.")
		return
	}
	if in.Website != "" {
		writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "We could not create your store. Reload the page and try again.")
		return
	}
	if address, err := mail.ParseAddress(email); err != nil || address.Address != email {
		writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "Enter a valid email address.")
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
	d, owner, err := s.svc.SignUp(r.Context(), s.Clock.NowIso(), service.SignUpInput{
		StoreName: in.StoreName, Subdomain: strings.ToLower(strings.TrimSpace(in.Subdomain)), Industry: in.Industry,
		TemplateID: in.TemplateID, OwnerName: in.OwnerName, Email: email,
	}, hash)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	s.publish(d)
	s.notify.MailUserVerify(r.Context(), owner)
	s.issueUser(r.Context(), w, owner)
}

// checkSubdomain answers the sign-up page's live availability check.
func (s *Server) checkSubdomain(w http.ResponseWriter, r *http.Request) {
	if !s.subdomainChecks.allow(s.clientIP(r), w) {
		writeProblem(w, http.StatusTooManyRequests, "RATE_LIMITED", "Too many checks. Wait a minute and try again.")
		return
	}
	check, err := s.svc.CheckSubdomain(r.Context(), strings.ToLower(strings.TrimSpace(r.URL.Query().Get("name"))))
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, check)
}

// verifyUserEmail spends a confirmation link and marks the owner's inbox proven.
func (s *Server) verifyUserEmail(w http.ResponseWriter, r *http.Request) {
	if !s.forgotAllowed(w, r) {
		return
	}
	var in verifyInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	d, err := s.svc.Run(r.Context(), func(t *kernel.Tx) error {
		id, err := notifications.RedeemUserVerify(r.Context(), t.Tx, in.Token)
		if err != nil {
			return linkError(err)
		}
		return identity.MarkEmailVerified(t, id, s.Clock.NowIso())
	})
	if err != nil {
		s.writeStaffError(w, r, err)
		return
	}
	s.publish(d)
	w.WriteHeader(http.StatusNoContent)
}

// resendUserVerify mails the signed-in person a new confirmation link.
func (s *Server) resendUserVerify(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.From(r.Context())
	if p.Kind != auth.KindUser {
		writeProblem(w, http.StatusForbidden, "FORBIDDEN", "Only a signed-in person can confirm an email.")
		return
	}
	if !s.emailOn(w) {
		return
	}
	u, err := store.Get[domain.User](r.Context(), s.DB.Pool, "users", p.ID)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if u.EmailVerifiedAt != nil {
		writeProblem(w, http.StatusConflict, "ALREADY_VERIFIED", "Your email is already confirmed.")
		return
	}
	if !s.mailAllowed(u.Email) {
		writeProblem(w, http.StatusTooManyRequests, "RATE_LIMITED", "We sent a link a moment ago. Check your inbox, or try again in a minute.")
		return
	}
	s.notify.MailUserVerify(r.Context(), u)
	writeJSON(w, http.StatusAccepted, map[string]string{"message": "A new link is on its way to " + u.Email + "."})
}

// verifiedToPublish keeps a store made at sign-up off the web until its owner proves their email,
// while email is on. Only the home page puts the store live, so only it waits. A platform admin is
// not held back. The check sits here because it reads the page, its tenant and the person, which
// three owners keep; the service's publish then runs its own rules.
func (s *Server) verifiedToPublish(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if blocked, err := s.publishWaitsForEmail(r); err != nil {
			s.writeError(w, r, err)
			return
		} else if blocked {
			writeProblem(w, http.StatusConflict, "EMAIL_UNVERIFIED", "Confirm your email before you publish your store.")
			return
		}
		next(w, r)
	}
}

func (s *Server) publishWaitsForEmail(r *http.Request) (bool, error) {
	p, _ := auth.From(r.Context())
	if !s.notify.On() || p.Kind != auth.KindUser || p.Role == "platform_admin" {
		return false, nil
	}
	ctx := r.Context()
	// A missing page or one outside the person's brands goes on to the service, which says so.
	page, err := store.Get[domain.Page](ctx, s.DB.Pool, "pages", r.PathValue("id"))
	if err != nil || page.Kind != "home" || !p.CanAccess(page.TenantID) {
		return false, nil
	}
	tenant, err := store.Get[domain.Tenant](ctx, s.DB.Pool, "tenants", page.TenantID)
	if err != nil || tenant.Source != "signup" {
		return false, nil
	}
	u, err := store.Get[domain.User](ctx, s.DB.Pool, "users", p.ID)
	if err != nil {
		return false, err
	}
	return u.EmailVerifiedAt == nil, nil
}
