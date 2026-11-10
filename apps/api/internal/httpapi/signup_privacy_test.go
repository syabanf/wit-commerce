package httpapi_test

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
)

// Anyone can sign up for a store, so what a new owner sees must hold nothing about other brands' staff.

func TestASignedUpOwnerSeesNoAdminEmail(t *testing.T) {
	e := setup(t)
	owner := e.signUp("kopi-senja", "rina@example.com")
	var state struct {
		State struct {
			Users []struct {
				ID    string `json:"id"`
				Email string `json:"email"`
				Role  string `json:"role"`
			} `json:"users"`
		} `json:"state"`
	}
	if code := e.call("GET", "/state", owner.Token, nil, &state); code != 200 {
		t.Fatalf("state: %d", code)
	}
	for _, u := range state.State.Users {
		if u.ID == owner.User.ID {
			continue
		}
		if u.Role != "platform_admin" {
			t.Errorf("the owner's state carries %s, who works in another brand", u.ID)
		}
		if u.Email != "" {
			t.Errorf("the owner's state carries the email of %s", u.ID)
		}
	}
	// A platform admin still reads the whole record.
	var admin struct {
		State struct {
			Users []struct {
				ID    string `json:"id"`
				Email string `json:"email"`
			} `json:"users"`
		} `json:"state"`
	}
	e.call("GET", "/state", e.login("dewi@commerceos.id"), nil, &admin)
	for _, u := range admin.State.Users {
		if u.ID == "usr-dewi" && u.Email == "" {
			t.Fatal("a platform admin lost their own email")
		}
	}
}

func TestASignUpStaysOutOfOtherBrandsStreams(t *testing.T) {
	e := setup(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", e.url+"/events", nil)
	req.Header.Set("Authorization", "Bearer "+e.admin)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	lines := bufio.NewScanner(res.Body)
	lines.Buffer(make([]byte, 1<<20), 1<<22)
	lines.Scan() // event: hello
	lines.Scan()

	// A stranger signs up while Lari's admin watches their stream.
	e.signUp("kopi-senja", "rina@example.com")
	heard := make(chan string, 1)
	go func() {
		for lines.Scan() {
			if line := lines.Text(); strings.HasPrefix(line, "data: ") && strings.Contains(line, "rina@example.com") {
				heard <- line
				return
			}
		}
	}()
	select {
	case line := <-heard:
		var delta map[string]any
		_ = json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &delta)
		t.Fatalf("Lari's stream carried the new owner's account: %v", delta)
	case <-time.After(1500 * time.Millisecond):
	}
}
