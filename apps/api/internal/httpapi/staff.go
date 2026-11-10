package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/http"
	"net/mail"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/identity"
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

// issuedStaffResponse says how the person gets in: a link by email, or, with email off, a password
// the server shows this one time. With email on the admin never sees a password.
type issuedStaffResponse struct {
	User              domain.User `json:"user"`
	TemporaryPassword string      `json:"temporaryPassword,omitempty"`
	EmailSent         bool        `json:"emailSent"`
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

func (s *Server) emailReady() bool { return s.notify.On() }

func (s *Server) writeStaffError(w http.ResponseWriter, r *http.Request, err error) {
	var refused staffError
	if errors.As(err, &refused) {
		writeProblem(w, refused.status, refused.code, refused.reason)
		return
	}
	s.writeError(w, r, err)
}

// changeStaff locks the person, runs the rule, then saves what change returns along with the event
// it describes, in one transaction, so no change goes unrecorded. The lock serialises changes, so
// two admins cannot both demote each other and leave no platform admin.
func (s *Server) changeStaff(ctx context.Context, actor auth.Principal, id string, change func(tx pgx.Tx, u domain.User) (domain.User, staffEvent, error)) (domain.User, error) {
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
		var event staffEvent
		saved, event, err = change(tx, u)
		if err != nil {
			return err
		}
		if err := store.Put(ctx, tx, "users", id, saved); err != nil {
			return err
		}
		if event.action == "" {
			return nil
		}
		event.target, event.tenantIDs = saved, append(slices.Clone(u.TenantIDs), saved.TenantIDs...)
		return event.record(ctx, tx, actor.ID)
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
	u := domain.User{ID: ids.New("usr"), Name: in.Name, Email: email, Title: in.Title, Role: in.Role, TenantIDs: in.TenantIDs, Color: "#4c5a78", Invited: s.emailReady()}
	_, err = s.svc.Run(r.Context(), func(t *kernel.Tx) error {
		if err := identity.CreateUser(t, u, hash); err != nil {
			return err
		}
		return staffEvent{action: "created", detail: roleLabel(u.Role), target: u, tenantIDs: u.TenantIDs}.record(r.Context(), t.Tx, p.ID)
	})
	if err != nil {
		s.writeStaffError(w, r, err)
		return
	}
	if s.emailReady() {
		writeJSON(w, http.StatusOK, issuedStaffResponse{User: u, EmailSent: s.sendInvite(r.Context(), p, u)})
		return
	}
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
	saved, err := s.changeStaff(r.Context(), p, id, func(tx pgx.Tx, u domain.User) (domain.User, staffEvent, error) {
		if !mayManage(p, in.Role, in.TenantIDs) {
			return u, staffEvent{}, errStaffForbidden
		}
		access := in.Role != u.Role || !slices.Equal(in.TenantIDs, u.TenantIDs)
		if access && id == p.ID {
			return u, staffEvent{}, staffError{http.StatusConflict, "OWN_ACCESS", "Ask another admin to change your own role or brands."}
		}
		if in.Role != "platform_admin" {
			if err := keepsAnAdmin(r.Context(), tx, u); err != nil {
				return u, staffEvent{}, err
			}
		}
		detail, err := changesBetween(r.Context(), tx, u, in)
		if err != nil {
			return u, staffEvent{}, err
		}
		u.Name, u.Title, u.Role, u.TenantIDs = in.Name, in.Title, in.Role, in.TenantIDs
		if detail == "" {
			return u, staffEvent{}, nil
		}
		return u, staffEvent{action: "updated", detail: detail}, nil
	})
	if err != nil {
		s.writeStaffError(w, r, err)
		return
	}
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
	saved, err := s.changeStaff(r.Context(), p, id, func(tx pgx.Tx, u domain.User) (domain.User, staffEvent, error) {
		if id == p.ID {
			return u, staffEvent{}, staffError{http.StatusConflict, "OWN_ACCESS", "You cannot disable your own account."}
		}
		if in.Disabled {
			if err := keepsAnAdmin(r.Context(), tx, u); err != nil {
				return u, staffEvent{}, err
			}
		}
		action := "enabled"
		if in.Disabled {
			action = "disabled"
		}
		u.Disabled = in.Disabled
		return u, staffEvent{action: action}, nil
	})
	if err != nil {
		s.writeStaffError(w, r, err)
		return
	}
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
	saved, err := s.changeStaff(r.Context(), p, id, func(tx pgx.Tx, u domain.User) (domain.User, staffEvent, error) {
		if id == p.ID {
			return u, staffEvent{}, staffError{http.StatusConflict, "OWN_ACCESS", "Change your own password from the account menu."}
		}
		_, err := tx.Exec(r.Context(), `insert into credentials (user_id, password_hash, tokens_valid_from) values ($1, $2, $3)
			on conflict (user_id) do update set password_hash = excluded.password_hash,
			tokens_valid_from = excluded.tokens_valid_from, updated_at = now()`, id, hash, time.Now().Truncate(time.Second))
		return u, staffEvent{action: "password_reset"}, err
	})
	if err != nil {
		s.writeStaffError(w, r, err)
		return
	}
	if s.emailReady() {
		writeJSON(w, http.StatusOK, issuedStaffResponse{User: saved, EmailSent: s.mailAdminReset(r.Context(), saved)})
		return
	}
	writeJSON(w, http.StatusOK, issuedStaffResponse{User: saved, TemporaryPassword: password})
}

// inviteStaff sends a pending invitation again; the earlier link stops working.
func (s *Server) inviteStaff(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.From(r.Context())
	if !s.emailOn(w) {
		return
	}
	id := r.PathValue("id")
	u, err := store.Get[domain.User](r.Context(), s.DB.Pool, "users", id)
	if err != nil {
		writeProblem(w, http.StatusNotFound, "NOT_FOUND", "That person does not exist.")
		return
	}
	if !mayManage(p, u.Role, u.TenantIDs) {
		s.writeStaffError(w, r, errStaffForbidden)
		return
	}
	if !u.Invited || u.Disabled {
		writeProblem(w, http.StatusConflict, "NOT_INVITED", "This person has no pending invitation.")
		return
	}
	writeJSON(w, http.StatusOK, issuedStaffResponse{User: u, EmailSent: s.sendInvite(r.Context(), p, u)})
}

// sendInvite mails the invitation and records whether it went out.
func (s *Server) sendInvite(ctx context.Context, actor auth.Principal, u domain.User) bool {
	sent := s.mailInvite(ctx, u)
	action := "invite_failed"
	if sent {
		action = "invite_sent"
	}
	s.recordStaff(ctx, actor.ID, staffEvent{action: action, target: u, tenantIDs: u.TenantIDs})
	return sent
}
