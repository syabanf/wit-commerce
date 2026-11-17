package kernel

import (
	"bytes"
	"encoding/json"
	"strings"
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
