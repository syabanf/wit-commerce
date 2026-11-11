package httpapi

import (
	"net/http"

	"github.com/syabanf/wit-commerce/apps/api/internal/modules/currency"
)

// displayCurrenciesInput is the body of PUT /tenants/{id}/display-currencies.
type displayCurrenciesInput struct {
	Currencies []string `json:"currencies"`
}

// currencyRoutes registers the platform's exchange rates, for platform admins only.
func (s *Server) currencyRoutes(rt *router) {
	rt.add("GET", "/settings/currencies", "", "", "Exchange rates for estimated shopper prices, with source and age (platform admin)", s.platformAdmin(s.getCurrencies))
	rt.add("PUT", "/settings/currencies", "", "", "Set manual rates, or switch codes back to the automatic rate (platform admin)", s.platformAdmin(s.saveCurrencies))
	rt.add("POST", "/settings/currencies/refresh", "", "", "Fetch the automatic rates now; manual rates stay (platform admin)", s.platformAdmin(s.refreshCurrencies))
}

func (s *Server) getCurrencies(w http.ResponseWriter, r *http.Request) {
	out, err := s.currency.List(r.Context())
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) saveCurrencies(w http.ResponseWriter, r *http.Request) {
	var in currency.RatesInput
	if err := decode(r, &in); err != nil {
		s.writeError(w, r, err)
		return
	}
	out, err := s.currency.Save(r.Context(), s.meta(r), in)
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) refreshCurrencies(w http.ResponseWriter, r *http.Request) {
	outcome := s.currency.Refresh(r.Context())
	out, err := s.currency.List(r.Context())
	if err != nil {
		s.writeError(w, r, err)
		return
	}
	out.Refresh = &outcome
	writeJSON(w, http.StatusOK, out)
}
