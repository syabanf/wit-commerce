package httpapi_test

import (
	"encoding/json"
	"regexp"
	"strings"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"

	"github.com/syabanf/wit-commerce/apps/api/internal/httpapi"
)

func spec(t *testing.T) []byte {
	t.Helper()
	return httpapi.New(httpapi.Options{Version: "test"}).Spec()
}

func TestSpecIsValidOpenAPI(t *testing.T) {
	doc, err := openapi3.NewLoader().LoadFromData(spec(t))
	if err != nil {
		t.Fatal(err)
	}
	if err := doc.Validate(t.Context()); err != nil {
		t.Fatal(err)
	}
}

// Routes that act on the id in the URL alone take no body; every other write documents one.
var noBody = regexp.MustCompile(`/(toggle|publish|unpublish|launch|pause|resolve|sync|rotate|revoke|test|retry)$|/onboarding/\{step\}$`)

func TestEveryWriteDocumentsItsBody(t *testing.T) {
	var doc struct {
		Paths map[string]map[string]struct {
			RequestBody any    `json:"requestBody"`
			Action      string `json:"x-action"`
			Scope       string `json:"x-required-scope"`
		} `json:"paths"`
	}
	if err := json.Unmarshal(spec(t), &doc); err != nil {
		t.Fatal(err)
	}
	actions := map[string]bool{}
	for path, ops := range doc.Paths {
		for method, op := range ops {
			if op.Action != "" {
				actions[op.Action] = true
			}
			if method != "post" && method != "put" {
				continue
			}
			if op.RequestBody == nil && !noBody.MatchString(path) {
				t.Errorf("%s %s has no documented body", method, path)
			}
			if strings.HasSuffix(path, "/credentials") && op.Scope != "" {
				t.Errorf("%s %s must stay out of reach of API keys", method, path)
			}
		}
	}
	// Every reducer action except the job timer (hidden from the contract) is in the document.
	if want := 55; len(actions) != want {
		t.Errorf("documented %d actions, want %d", len(actions), want)
	}
}

func TestSpecNeverNamesASecretValueField(t *testing.T) {
	var doc struct {
		Components struct {
			Schemas map[string]struct {
				Properties map[string]any `json:"properties"`
			} `json:"schemas"`
		} `json:"components"`
	}
	if err := json.Unmarshal(spec(t), &doc); err != nil {
		t.Fatal(err)
	}
	if _, leaks := doc.Components.Schemas["Credential"].Properties["secret"]; leaks {
		t.Error("Credential must not carry the secret")
	}
	for _, field := range []string{"value", "ciphertext"} {
		if _, leaks := doc.Components.Schemas["ConnectorFieldState"].Properties[field]; leaks {
			t.Errorf("ConnectorFieldState must not carry %s", field)
		}
	}
}
