package httpapi

import (
	"net/http"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/notifications"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// platformAdmin wraps a handler that only a signed-in platform admin may call; API keys never can.
func (s *Server) platformAdmin(h http.HandlerFunc) http.HandlerFunc {
	return s.guarded(func(p auth.Principal) (bool, string) {
		return p.Kind == auth.KindUser && p.Role == "platform_admin", "Only a platform admin changes platform settings."
	}, h)
}

func (s *Server) getEmailSettings(w http.ResponseWriter, r *http.Request) {
	out, err := s.notify.GetEmailSettings(r.Context())
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) saveEmailSettings(w http.ResponseWriter, r *http.Request) {
	var in notifications.EmailSettingsInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	out, err := s.notify.SaveEmailSettings(r.Context(), s.meta(r), in)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// sendTestEmail mails the signed-in admin, at most three times a minute like any address.
func (s *Server) sendTestEmail(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.From(r.Context())
	u, err := store.Get[domain.User](r.Context(), s.DB.Pool, "users", p.ID)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	if !s.mailAllowed(u.Email) {
		writeProblem(w, http.StatusTooManyRequests, "RATE_LIMITED", "Too many emails to this address. Try again in a minute.")
		return
	}
	writeJSON(w, http.StatusOK, s.notify.SendTest(r.Context(), u.Email))
}
