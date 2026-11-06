// Package modules_test holds the rules that keep the modules apart: which collections each one
// writes, and which other modules it may import.
package modules_test

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"testing"
)

const modulePath = "github.com/syabanf/wit-commerce/apps/api/internal/"

// owns lists the collections each module writes. No module writes another module's collections:
// it calls the owner instead.
var owns = map[string][]string{
	"identity":     {"tenants", "users"},
	"catalog":      {"products", "categories", "attributes", "modifiers", "collections", "paymentTypes", "agentPolicies"},
	"inventory":    {"warehouses", "stock", "stockMoves", "modifierStock", "modifierStockMoves"},
	"crm":          {"customers", "customerEvents", "segments", "leads", "tickets"},
	"marketing":    {"campaigns", "automations", "promotions"},
	"storefront":   {"sellers", "pages", "templates", "traffic", "searchTerms"},
	"integrations": {"integrations", "integrationLogs"},
	"orders":       {"orders"},
	// notifications writes the email_tokens table, and ai writes nothing: neither owns a collection.
	"notifications": {},
	"ai":            {},
}

// mayImport lists the modules each module calls. Calls run one way, so no cycle can form.
var mayImport = map[string][]string{
	"inventory": {"catalog"},
	"marketing": {"crm"},
	"identity":  {"crm"},
	"orders":    {"identity", "inventory", "crm", "marketing"},
}

var write = regexp.MustCompile(`t\.(?:Put|Del)\("([a-zA-Z]+)"`)

// read matches the kernel and store calls that load a collection by name.
var read = regexp.MustCompile(`(?:kernel\.(?:Get|Lock|TenantRows)|store\.[A-Z][A-Za-z]*)(?:\[[^\]]*\])?\([^"\n]*"([a-zA-Z]+)"`)

func TestModulesWriteOnlyTheirOwnCollections(t *testing.T) {
	for module, files := range sources(t) {
		allowed := owns[module]
		for _, file := range files {
			src, err := os.ReadFile(file)
			if err != nil {
				t.Fatal(err)
			}
			for _, m := range write.FindAllStringSubmatch(string(src), -1) {
				if !slices.Contains(allowed, m[1]) {
					t.Errorf("%s writes %s, which another module owns; call that module instead", file, m[1])
				}
			}
		}
	}
}

func TestModulesReadOnlyTheirOwnCollections(t *testing.T) {
	for module, files := range sources(t) {
		for _, file := range files {
			src, err := os.ReadFile(file)
			if err != nil {
				t.Fatal(err)
			}
			for _, m := range read.FindAllStringSubmatch(string(src), -1) {
				if !slices.Contains(owns[module], m[1]) {
					t.Errorf("%s reads %s, which another module owns; call that module's read function", file, m[1])
				}
			}
		}
	}
}

func TestModulesImportOnlyAllowedModules(t *testing.T) {
	for module, files := range sources(t) {
		for _, file := range files {
			f, err := parser.ParseFile(token.NewFileSet(), file, nil, parser.ImportsOnly)
			if err != nil {
				t.Fatal(err)
			}
			for _, spec := range f.Imports {
				path, _ := strconv.Unquote(spec.Path.Value)
				rest, ok := strings.CutPrefix(path, modulePath)
				if !ok {
					continue
				}
				if rest == "service" || rest == "httpapi" {
					t.Errorf("%s imports %s; modules sit below the facade and the HTTP layer", file, rest)
				}
				if other, ok := strings.CutPrefix(rest, "modules/"); ok && !slices.Contains(mayImport[module], other) {
					t.Errorf("%s imports module %s; add it to mayImport only if the call cannot go the other way", file, other)
				}
			}
		}
	}
}

// sources maps each module to its non-test Go files.
func sources(t *testing.T) map[string][]string {
	t.Helper()
	out := map[string][]string{}
	for module := range owns {
		files, err := filepath.Glob(filepath.Join(module, "*.go"))
		if err != nil {
			t.Fatal(err)
		}
		for _, f := range files {
			if !strings.HasSuffix(f, "_test.go") {
				out[module] = append(out[module], f)
			}
		}
		if len(out[module]) == 0 {
			t.Fatalf("module %s has no files", module)
		}
	}
	return out
}
