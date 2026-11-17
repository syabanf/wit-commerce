package httpapi_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
)

type staffIssued struct {
	User              domain.User `json:"user"`
	TemporaryPassword string      `json:"temporaryPassword"`
}

func newStaff(email, role string, brands ...string) map[string]any {
	return map[string]any{"name": "New Person", "email": email, "title": "Staff", "role": role, "tenantIds": brands}
}

func (e *env) create(token string, body map[string]any) staffIssued {
	e.t.Helper()
	var out staffIssued
	if code := e.call("POST", "/users", token, body, &out); code != 200 {
		e.t.Fatalf("create staff: %d", code)
	}
	return out
}

func (e *env) signIn(email, pass string) string {
	e.t.Helper()
	var out struct {
		Token string `json:"token"`
	}
	if code := e.call("POST", "/auth/login", "", map[string]string{"email": email, "password": pass}, &out); code != 200 {
		e.t.Fatalf("sign in %s: %d", email, code)
	}
	return out.Token
}

// tenantIds are real seed ids; andi is a tenant admin of Lari and Aruna, hendra of Teknika.
func TestStaffCannotBeCreatedAboveOrOutsideTheActor(t *testing.T) {
	e := setup(t)
	e.expect(403, "POST", "/users", e.admin, newStaff("up@example.com", "platform_admin"))
	e.expect(403, "POST", "/users", e.admin, newStaff("out@example.com", "marketing", "ten-teknika"))
	e.expect(403, "POST", "/users", e.login("maya@lari.co.id"), newStaff("m@example.com", "marketing", "ten-lari"))
	e.expect(422, "POST", "/users", e.admin, newStaff("none@example.com", "marketing"))
	e.expect(422, "POST", "/users", e.admin, newStaff("no-such@example.com", "no_such_role", "ten-lari"))
	e.expect(422, "POST", "/users", e.admin, newStaff("not-an-email", "marketing", "ten-lari"))
	e.expect(409, "POST", "/users", e.admin, newStaff("Maya@Lari.co.id", "marketing", "ten-lari"))
}

func TestAnAPIKeyCannotCreateStaff(t *testing.T) {
	e := setup(t)
	issued := e.issue("customers:write", "catalog:write")
	e.expect(403, "POST", "/users", issued.Secret, newStaff("key@example.com", "marketing", "ten-lari"))
}

func TestNewStaffSignsInWithTheTemporaryPassword(t *testing.T) {
	e := setup(t)
	made := e.create(e.admin, newStaff("New@Example.com", "marketing", "ten-lari"))
	if made.User.Email != "new@example.com" || len(made.TemporaryPassword) < 20 {
		t.Fatalf("issued: %+v", made)
	}
	e.signIn("new@example.com", made.TemporaryPassword)
}

func TestAResetCannotReachAnotherBrand(t *testing.T) {
	e := setup(t)
	teknika := e.create(e.login("hendra@teknika.co.id"), newStaff("t@example.com", "marketing", "ten-teknika"))
	e.expect(403, "POST", "/users/"+teknika.User.ID+"/reset-password", e.admin, nil)
	e.expect(403, "PUT", "/users/"+teknika.User.ID, e.admin, newStaff("", "marketing", "ten-lari"))
	e.expect(403, "POST", "/users/"+teknika.User.ID+"/status", e.admin, map[string]bool{"disabled": true})
	e.expect(403, "POST", "/users/usr-dewi/reset-password", e.admin, nil)
}

func TestResetEndsSessionsAndReplacesThePassword(t *testing.T) {
	e := setup(t)
	made := e.create(e.admin, newStaff("r@example.com", "marketing", "ten-lari"))
	old := e.signIn("r@example.com", made.TemporaryPassword)
	time.Sleep(1100 * time.Millisecond)
	var reset staffIssued
	if code := e.call("POST", "/users/"+made.User.ID+"/reset-password", e.admin, nil, &reset); code != 200 {
		t.Fatalf("reset: %d", code)
	}
	e.expect(401, "GET", "/auth/me", old, nil)
	e.expect(401, "POST", "/auth/login", "", map[string]string{"email": "r@example.com", "password": made.TemporaryPassword})
	e.signIn("r@example.com", reset.TemporaryPassword)
}

func TestDisablingAndRoleChangesApplyOnTheNextRequest(t *testing.T) {
	e := setup(t)
	made := e.create(e.admin, newStaff("d@example.com", "tenant_admin", "ten-lari"))
	token := e.signIn("d@example.com", made.TemporaryPassword)
	path := "/users/" + made.User.ID
	e.expect(200, "POST", "/users", token, newStaff("via-d@example.com", "marketing", "ten-lari"))
	e.expect(200, "PUT", path, e.admin, newStaff("", "marketing", "ten-lari"))
	e.expect(403, "POST", "/users", token, newStaff("via-d2@example.com", "marketing", "ten-lari"))
	e.expect(200, "POST", path+"/status", e.admin, map[string]bool{"disabled": true})
	e.expect(401, "GET", "/auth/me", token, nil)
	e.expect(401, "POST", "/auth/login", "", map[string]string{"email": "d@example.com", "password": made.TemporaryPassword})
	e.expect(200, "POST", path+"/status", e.admin, map[string]bool{"disabled": false})
	e.expect(200, "GET", "/auth/me", token, nil)
}

func TestNobodyLocksTheConsoleOut(t *testing.T) {
	e := setup(t)
	dewi := e.login("dewi@commerceos.id")
	e.expect(409, "POST", "/users/usr-dewi/status", dewi, map[string]bool{"disabled": true})
	e.expect(409, "POST", "/users/usr-dewi/reset-password", dewi, nil)
	e.expect(409, "PUT", "/users/usr-dewi", dewi, newStaff("", "marketing", "ten-lari"))
	second := e.create(dewi, newStaff("second@example.com", "platform_admin"))
	// The other admin may step in, until it would leave no platform admin.
	other := e.signIn("second@example.com", second.TemporaryPassword)
	e.expect(200, "POST", "/users/usr-dewi/status", other, map[string]bool{"disabled": true})
	e.expect(409, "PUT", "/users/"+second.User.ID, other, newStaff("", "marketing", "ten-lari"))
}

func TestStateHoldsOnlyColleagues(t *testing.T) {
	e := setup(t)
	var out struct {
		State struct {
			Users []json.RawMessage `json:"users"`
		} `json:"state"`
	}
	if code := e.call("GET", "/state", e.admin, nil, &out); code != 200 {
		t.Fatalf("state: %d", code)
	}
	for _, raw := range out.State.Users {
		var u domain.User
		_ = json.Unmarshal(raw, &u)
		if u.Email == "hendra@teknika.co.id" {
			t.Error("the state of a Lari admin holds a Teknika admin")
		}
	}
	if len(out.State.Users) == 0 {
		t.Error("no colleagues in the state")
	}
}

// A staff member works for the brand without a back-office job: they sign in and read, and every
// write that needs a permission refuses them.
func TestStaffRoleSignsInAndChangesNothing(t *testing.T) {
	e := setup(t)
	made := e.create(e.admin, newStaff("staff@example.com", "staff", "ten-lari"))
	if made.User.Role != "staff" {
		t.Fatalf("role: %+v", made.User)
	}
	token := e.signIn("staff@example.com", made.TemporaryPassword)
	var me struct {
		User domain.User `json:"user"`
	}
	if code := e.call("GET", "/auth/me", token, nil, &me); code != 200 || me.User.Role != "staff" || len(me.User.TenantIDs) != 1 {
		t.Fatalf("me: %d %+v", code, me.User)
	}
	e.expect(200, "GET", "/state", token, nil)
	e.expect(403, "POST", "/users", token, newStaff("via-staff@example.com", "staff", "ten-lari"))
	e.expect(403, "POST", "/tickets/tic-1/resolve", token, nil)
	e.expect(403, "PUT", "/leads/led-new", token, map[string]any{"id": "led-new", "tenantId": "ten-lari"})
	e.expect(422, "POST", "/users", e.admin, newStaff("no-brand@example.com", "staff"))
}

func TestSeededStaffUserSignsIn(t *testing.T) {
	e := setup(t)
	var me struct {
		User domain.User `json:"user"`
	}
	if code := e.call("GET", "/auth/me", e.login("nadia@lari.co.id"), nil, &me); code != 200 || me.User.Role != "staff" {
		t.Fatalf("me: %d %+v", code, me.User)
	}
}
