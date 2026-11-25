package httpapi

import (
	"net/http"

	"github.com/syabanf/wit-commerce/apps/api/internal/modules/identity"
)

type (
	closedDaysInput struct {
		ClosedDays []string `json:"closedDays"`
	}
	// holidaysResponse is every public holiday, oldest first.
	holidaysResponse struct {
		Holidays []identity.Holiday `json:"holidays"`
	}
)

func (s *Server) getHolidays(w http.ResponseWriter, r *http.Request) {
	list, err := identity.Holidays(r.Context(), s.DB.Pool)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, holidaysResponse{Holidays: list})
}

func (s *Server) saveHoliday(w http.ResponseWriter, r *http.Request) {
	var in identity.HolidayInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	if err := s.svc.SaveHoliday(r.Context(), s.meta(r), r.PathValue("date"), in); err != nil {
		s.writeError(w, r, err)
		return
	}
	s.getHolidays(w, r)
}

func (s *Server) removeHoliday(w http.ResponseWriter, r *http.Request) {
	if err := s.svc.RemoveHoliday(r.Context(), r.PathValue("date")); err != nil {
		s.writeError(w, r, err)
		return
	}
	s.getHolidays(w, r)
}
