package httpapi

import (
	"net/http"
)

// platformRoutes registers health, docs, the route table, sign-in, email settings and the server-side views.
func (s *Server) platformRoutes(rt *router) {
	rt.add("GET", "/health", "", "", "Liveness, database and event stream counts", s.health)
	rt.add("GET", "/openapi.json", "", "", "This API as an OpenAPI 3.0 document", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write(s.spec)
	})
	rt.add("GET", "/docs", "", "", "Reference documentation for this API", serveDocs)
	rt.add("GET", "/routes", "", "", "This table", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"routes": rt.table})
	})
	rt.add("POST", "/auth/login", "", "", "Email and password → bearer token", s.login)
	rt.add("GET", "/auth/me", "", "", "The signed-in user", s.user("", s.me))
	rt.add("POST", "/auth/forgot", "", "", "Email a link to choose a new password", s.forgotPassword)
	rt.add("POST", "/auth/reset", "", "", "Choose a new password with a link from email", s.resetPassword)
	rt.add("POST", "/auth/password", "", "", "Change the signed-in user's password", s.user("", s.changePassword))
	rt.add("POST", "/auth/signup", "", "", "Create a store and its owner account, and sign the owner in", s.signUp)
	rt.add("GET", "/signup/subdomain", "", "", "Whether a store address is free, with three free ones when it is not", s.checkSubdomain)
	rt.add("POST", "/auth/verify", "", "", "Confirm the signed-in owner's email with a link from email", s.verifyUserEmail)
	rt.add("POST", "/auth/verify/resend", "", "", "Email the signed-in person a new link to confirm their email", s.user("", s.resendUserVerify))
	rt.add("GET", "/settings/email", "", "", "How the platform sends email (platform admin); never the key", s.platformAdmin(s.getEmailSettings))
	rt.add("PUT", "/settings/email", "", "", "Save the Resend API key and from address (platform admin); an empty key keeps the saved one", s.platformAdmin(s.saveEmailSettings))
	rt.add("POST", "/settings/email/test", "", "", "Send a test email to the signed-in platform admin", s.platformAdmin(s.sendTestEmail))
	rt.add("GET", "/views/orders", "", "", "The orders list: filtered, searched, sorted and paged on the server", s.reader("orders:read", s.orderRows))
	rt.add("GET", "/views/customer-events", "", "", "Customer history, newest first: one customer, one kind, or the latest", s.reader("customers:read", s.customerEvents))
}

// sessionRoutes registers the demo accounts, the user's dataset, its event stream and the timed jobs.
func (s *Server) sessionRoutes(rt *router) {
	rt.add("GET", "/auth/demo-accounts", "", "", "Demo accounts for the login page (demo mode only)", s.demoAccounts)
	rt.add("GET", "/state", "", "", "The dataset scoped to the user's tenants", s.user("", s.state))
	rt.add("GET", "/events", "", "", "Server-sent events: every delta in the user's tenants", s.user("", s.userEvents))
	rt.add("POST", "/system/tick", "system/tick", "", "Run the timed jobs now (platform admin)", s.tick)
}
