package httpapi

import (
	"net/http"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/service"
)

// crmRoutes registers customers, segments, leads and tickets.
func (s *Server) crmRoutes(rt *router) {
	rt.add("PUT", "/customers/{id}", "customers/save", "customer.manage", "Create or replace a customer", upsert(s, func(m service.Meta, r *http.Request, c domain.Customer) (*service.Delta, error) {
		return s.svc.SaveCustomer(r.Context(), m, c)
	}))
	rt.add("POST", "/customers/{id}/notes", "customers/note", "customer.manage", "Add a note to a customer's timeline", note(s, s.svc.NoteCustomer))
	rt.add("POST", "/customers/{id}/points", "customers/addPoints", "customer.manage", "Add or take loyalty points", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Points int    `json:"points"`
			Reason string `json:"reason"`
		}
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.AddPoints(r.Context(), m, r.PathValue("id"), in.Points, in.Reason)
		})
	})
	rt.add("PUT", "/segments/{id}", "segments/save", "segment.manage", "Create or replace a segment", upsert(s, func(m service.Meta, r *http.Request, seg domain.Segment) (*service.Delta, error) {
		return s.svc.SaveSegment(r.Context(), m, seg)
	}))
	rt.add("DELETE", "/segments/{id}", "segments/remove", "segment.manage", "Remove a segment no campaign uses", idOnly(s, s.svc.RemoveSegment))
	rt.add("PUT", "/leads/{id}", "leads/save", "lead.manage", "Create or replace a lead", upsert(s, func(m service.Meta, r *http.Request, l domain.Lead) (*service.Delta, error) {
		return s.svc.SaveLead(r.Context(), m, l)
	}))
	rt.add("POST", "/leads/{id}/stage", "leads/move", "lead.manage", "Move a lead through the pipeline", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Stage      string  `json:"stage"`
			LostReason *string `json:"lostReason"`
		}
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.MoveLead(r.Context(), m, r.PathValue("id"), in.Stage, in.LostReason)
		})
	})
	rt.add("POST", "/tickets/{id}/assign", "tickets/assign", "ticket.manage", "Assign a ticket", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			AssigneeID *string `json:"assigneeId"`
		}
		if err := decode(r, &in); err != nil {
			s.writeError(w, r, err)
			return
		}
		s.act(w, r, func(m service.Meta) (*service.Delta, error) {
			return s.svc.AssignTicket(r.Context(), m, r.PathValue("id"), in.AssigneeID)
		})
	})
	rt.add("POST", "/tickets/{id}/resolve", "tickets/resolve", "ticket.manage", "Resolve a ticket", idOnly(s, s.svc.ResolveTicket))
}
