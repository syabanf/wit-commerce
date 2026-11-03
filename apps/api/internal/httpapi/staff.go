package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

type staffInput struct {
	Name      string   `json:"name"`
	Email     string   `json:"email,omitempty"`
	Title     string   `json:"title"`
	Role      string   `json:"role"`
	TenantIDs []string `json:"tenantIds"`
}

type staffStatusInput struct {
	Disabled bool `json:"disabled"`
}

type staffResponse struct {
	User domain.User `json:"user"`
}

// issuedStaffResponse carries a password the server shows this one time.
type issuedStaffResponse struct {
	User              domain.User `json:"user"`
	TemporaryPassword string      `json:"temporaryPassword"`
}

// staffError is a refusal with the status it answers with.
type staffError struct {
	status int
	code   string
	reason string
}

func (e staffError) Error() string { return e.reason }

var (
	errStaffForbidden = staffError{http.StatusForbidden, "FORBIDDEN", "You can only manage people within your own brands, and never a platform admin."}
	errLastAdmin      = staffError{http.StatusConflict, "LAST_ADMIN", "Keep at least one active platform admin."}
)

// mayManage is the rule behind every staff change: a platform admin manages anyone; anyone else
// only a person whose brands all sit within their own, so that a reset cannot reach another brand.
func mayManage(actor auth.Principal, role string, tenantIDs []string) bool {
	if actor.Role == "platform_admin" {
		return true
	}
	if role == "platform_admin" || len(tenantIDs) == 0 {
		return false
	}
	return !slices.ContainsFunc(tenantIDs, func(id string) bool { return !slices.Contains(actor.TenantIDs, id) })
}

func (s *Server) checkStaff(ctx context.Context, in *staffInput) error {
	invalid := func(reason string) error {
		return staffError{http.StatusUnprocessableEntity, "INVALID", reason}
	}
	in.Name, in.Title = strings.TrimSpace(in.Name), strings.TrimSpace(in.Title)
	if in.Name == "" || len(in.Name) > 120 || len(in.Title) > 120 {
		return invalid("Enter a name, and keep the name and title under 120 characters.")
	}
	if !auth.ValidRole(in.Role) {
		return invalid("Choose one of the roles.")
	}
	if in.Role == "platform_admin" {
		in.TenantIDs = []string{}
		return nil
	}
	if len(in.TenantIDs) == 0 {
		return invalid("Choose at least one brand.")
	}
	for _, id := range in.TenantIDs {
		if _, err := store.Get[domain.Tenant](ctx, s.DB.Pool, "tenants", id); err != nil {
			return invalid("One of the brands does not exist.")
		}
	}
	return nil
}

func temporaryPassword() (string, error) {
	raw := make([]byte, 18)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func (s *Server) writeStaffError(w http.ResponseWriter, r *http.Request, err error) {
	var refused staffError
	if errors.As(err, &refused) {
		writeProblem(w, refused.status, refused.code, refused.reason)
		return
	}
	s.writeError(w, r, err)
}

func (s *Server) logStaffChange(r *http.Request, action, targetID string) {
	p, _ := auth.From(r.Context())
	s.Log.Info("staff change", "action", action, "actor", p.ID, "target", targetID, "requestId", requestIDOf(r.Context()))
}

// changeStaff locks the person, runs the rule, then saves what change returns. The lock serialises
// changes, so two admins cannot both demote each other and leave no platform admin.
func (s *Server) changeStaff(ctx context.Context, actor auth.Principal, id string, change func(tx pgx.Tx, u domain.User) (domain.User, error)) (domain.User, error) {
	var saved domain.User
	err := pgx.BeginFunc(ctx, s.DB.Pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtext('staff'))`); err != nil {
			return err
		}
		u, err := store.Get[domain.User](ctx, tx, "users", id)
		if err != nil {
			return staffError{http.StatusNotFound, "NOT_FOUND", "That person does not exist."}
		}
		if !mayManage(actor, u.Role, u.TenantIDs) {
			return errStaffForbidden
		}
		saved, err = change(tx, u)
		if err != nil {
			return err
		}
		return store.Put(ctx, tx, "users", id, saved)
	})
	return saved, err
}

// keepsAnAdmin refuses a change that takes the last active platform admin away.
func keepsAnAdmin(ctx context.Context, tx pgx.Tx, u domain.User) error {
	if u.Role != "platform_admin" || u.Disabled {
		return nil
	}
	var others int
	err := tx.QueryRow(ctx, `select count(*) from users where id <> $1 and data->>'role' = 'platform_admin'
		and coalesce((data->>'disabled')::boolean, false) = false`, u.ID).Scan(&others)
	if err != nil {
		return err
	}
	if others == 0 {
		return errLastAdmin
	}
	return nil
}

func (s *Server) createStaff(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.From(r.Context())
	var in staffInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	email := normalEmail(in.Email)
	if address, err := mail.ParseAddress(email); err != nil || address.Address != email {
		writeProblem(w, http.StatusUnprocessableEntity, "INVALID", "Enter a valid email address.")
		return
	}
	if err := s.checkStaff(r.Context(), &in); err != nil {
		s.writeStaffError(w, r, err)
		return
	}
	if !mayManage(p, in.Role, in.TenantIDs) {
		s.writeStaffError(w, r, errStaffForbidden)
		return
	}
	password, err := temporaryPassword()
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	u := domain.User{ID: ids.New("usr"), Name: in.Name, Email: email, Title: in.Title, Role: in.Role, TenantIDs: in.TenantIDs, Color: "#4c5a78"}
	err = pgx.BeginFunc(r.Context(), s.DB.Pool, func(tx pgx.Tx) error {
		var taken bool
		if err := tx.QueryRow(r.Context(), `select exists (select 1 from users where email = $1)`, email).Scan(&taken); err != nil {
			return err
		}
		if taken {
			return staffError{http.StatusConflict, "EMAIL_TAKEN", "Someone already signs in with this email."}
		}
		if err := store.Put(r.Context(), tx, "users", u.ID, u); err != nil {
			return err
		}
		_, err := tx.Exec(r.Context(), `insert into credentials (user_id, password_hash) values ($1, $2)`, u.ID, hash)
		return err
	})
	if err != nil {
		s.writeStaffError(w, r, err)
		return
	}
	s.logStaffChange(r, "create", u.ID)
	writeJSON(w, http.StatusOK, issuedStaffResponse{User: u, TemporaryPassword: password})
}

func (s *Server) updateStaff(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.From(r.Context())
	var in staffInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	if err := s.checkStaff(r.Context(), &in); err != nil {
		s.writeStaffError(w, r, err)
		return
	}
	id := r.PathValue("id")
	saved, err := s.changeStaff(r.Context(), p, id, func(tx pgx.Tx, u domain.User) (domain.User, error) {
		if !mayManage(p, in.Role, in.TenantIDs) {
			return u, errStaffForbidden
		}
		access := in.Role != u.Role || !slices.Equal(in.TenantIDs, u.TenantIDs)
		if access && id == p.ID {
			return u, staffError{http.StatusConflict, "OWN_ACCESS", "Ask another admin to change your own role or brands."}
		}
		if in.Role != "platform_admin" {
			if err := keepsAnAdmin(r.Context(), tx, u); err != nil {
				return u, err
			}
		}
		u.Name, u.Title, u.Role, u.TenantIDs = in.Name, in.Title, in.Role, in.TenantIDs
		return u, nil
	})
	if err != nil {
		s.writeStaffError(w, r, err)
		return
	}
	s.logStaffChange(r, "update", id)
	writeJSON(w, http.StatusOK, staffResponse{User: saved})
}

func (s *Server) setStaffStatus(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.From(r.Context())
	var in staffStatusInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	id := r.PathValue("id")
	saved, err := s.changeStaff(r.Context(), p, id, func(tx pgx.Tx, u domain.User) (domain.User, error) {
		if id == p.ID {
			return u, staffError{http.StatusConflict, "OWN_ACCESS", "You cannot disable your own account."}
		}
		if in.Disabled {
			if err := keepsAnAdmin(r.Context(), tx, u); err != nil {
				return u, err
			}
		}
		u.Disabled = in.Disabled
		return u, nil
	})
	if err != nil {
		s.writeStaffError(w, r, err)
		return
	}
	s.logStaffChange(r, fmt.Sprintf("disabled=%t", in.Disabled), id)
	writeJSON(w, http.StatusOK, staffResponse{User: saved})
}

// resetStaffPassword hands out a temporary password and ends the person's other sessions.
func (s *Server) resetStaffPassword(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.From(r.Context())
	id := r.PathValue("id")
	password, err := temporaryPassword()
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	saved, err := s.changeStaff(r.Context(), p, id, func(tx pgx.Tx, u domain.User) (domain.User, error) {
		if id == p.ID {
			return u, staffError{http.StatusConflict, "OWN_ACCESS", "Change your own password from the account menu."}
		}
		_, err := tx.Exec(r.Context(), `insert into credentials (user_id, password_hash, tokens_valid_from) values ($1, $2, $3)
			on conflict (user_id) do update set password_hash = excluded.password_hash,
			tokens_valid_from = excluded.tokens_valid_from, updated_at = now()`, id, hash, time.Now().Truncate(time.Second))
		return u, err
	})
	if err != nil {
		s.writeStaffError(w, r, err)
		return
	}
	s.logStaffChange(r, "reset-password", id)
	writeJSON(w, http.StatusOK, issuedStaffResponse{User: saved, TemporaryPassword: password})
}
