package kernel

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5"
)

type outboxEvent struct {
	name string
	data any
}

// Emit records an event that a row's change alone cannot express, such as an order getting paid.
func (t *Tx) Emit(name string, data any) { t.events = append(t.events, outboxEvent{name, data}) }

// rowEvents names what a written row means to subscribers.
var rowEvents = map[string]string{
	"products":      "product.updated",
	"stock":         "inventory.updated",
	"modifierStock": "inventory.updated",
	"customers":     "customer.updated",
}

// EventPayload is the body of one webhook delivery.
func EventPayload(event, tenantID, at string, data any) ([]byte, error) {
	return json.Marshal(map[string]any{"event": event, "tenantId": tenantID, "at": at, "data": data})
}

// enqueue writes one delivery per subscribed endpoint, inside the action's transaction.
func (t *Tx) enqueue(at string) error {
	events := t.events
	for collection, name := range rowEvents {
		for _, row := range t.D.Upserts[collection] {
			events = append(events, outboxEvent{name, row})
		}
	}
	for _, e := range events {
		raw, err := json.Marshal(e.data)
		if err != nil {
			return err
		}
		var keys struct {
			ID       string `json:"id"`
			TenantID string `json:"tenantId"`
		}
		if err := json.Unmarshal(raw, &keys); err != nil {
			return err
		}
		if e.name == "customer.updated" && t.Created[keys.ID] {
			continue // customer.created already reports this row.
		}
		payload, err := EventPayload(e.name, keys.TenantID, at, json.RawMessage(raw))
		if err != nil {
			return err
		}
		if _, err := t.Exec(t.Ctx, `insert into webhook_deliveries (endpoint_id, tenant_id, event, payload, created_at)
			select id, tenant_id, $2, $3, $4 from webhook_endpoints where tenant_id = $1 and enabled and $2 = any(events)`,
			keys.TenantID, e.name, payload, at); err != nil {
			return err
		}
	}
	return nil
}

// LogCredential appends to the audit trail of keys, webhooks and connector secrets.
func LogCredential(ctx context.Context, tx pgx.Tx, m Meta, tenantID, subject, action string) error {
	_, err := tx.Exec(ctx, `insert into credential_events (tenant_id, subject, action, by, at) values ($1, $2, $3, $4, $5)`,
		tenantID, subject, action, m.By(), m.At)
	return err
}
