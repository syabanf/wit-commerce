package kernel

import (
	"bytes"
	"encoding/json"
	"regexp"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"
)

// ScrubDeliveries replaces personal values in a tenant's webhook payloads, sent or waiting, with a
// placeholder. Values are matched as JSON spells them; empty ones are skipped.
func (t *Tx) ScrubDeliveries(tenantID, placeholder string, values ...string) error {
	for _, v := range values {
		if strings.TrimSpace(v) == "" {
			continue
		}
		var quoted bytes.Buffer
		enc := json.NewEncoder(&quoted)
		enc.SetEscapeHTML(false)
		if err := enc.Encode(v); err != nil {
			return err
		}
		inner := strings.TrimSuffix(strings.TrimSpace(quoted.String()), `"`)[1:]
		if _, err := t.Exec(t.Ctx, `update webhook_deliveries set payload = replace(payload::text, $2, $3)::jsonb
			where tenant_id = $1 and strpos(payload::text, $2) > 0`, tenantID, inner, placeholder); err != nil {
			return err
		}
	}
	return nil
}

// minNamePart is the shortest part of a name scrubbed on its own. Shorter parts ("Al", "Ani") also
// spell common words and parts of other names, so they go only as part of the full name.
const minNamePart = 4

// assistantLogPatterns are the Postgres regular expressions ScrubAssistantLog replaces, case
// insensitive: the email and phone as typed anywhere, the phone's digits alone, the full name and
// each name part of minNamePart letters or more as whole words only.
func assistantLogPatterns(email, phone, name string) []string {
	var out []string
	add := func(literal string, whole bool) {
		if literal = strings.TrimSpace(literal); literal == "" {
			return
		}
		p := regexp.QuoteMeta(literal)
		if whole {
			p = `\m` + p + `\M`
		}
		if !slices.Contains(out, p) {
			out = append(out, p)
		}
	}
	add(email, false)
	add(phone, false)
	digits := strings.Map(func(r rune) rune {
		if unicode.IsDigit(r) {
			return r
		}
		return -1
	}, phone)
	if len(digits) >= 8 {
		add(digits, false)
	}
	add(strings.Join(strings.Fields(name), " "), true)
	for _, part := range strings.Fields(name) {
		if utf8.RuneCountInString(part) >= minNamePart {
			add(part, true)
		}
	}
	return out
}

// ScrubAssistantLog replaces an erased customer's email, phone and name in the questions staff
// asked the admin assistant about the tenant, which are kept up to 90 days.
func (t *Tx) ScrubAssistantLog(tenantID, placeholder, email, phone, name string) error {
	for _, p := range assistantLogPatterns(email, phone, name) {
		if _, err := t.Exec(t.Ctx, `update assistant_log set question = regexp_replace(question, $2, $3, 'gi')
			where tenant_id = $1 and question ~* $2`, tenantID, p, placeholder); err != nil {
			return err
		}
	}
	return nil
}
