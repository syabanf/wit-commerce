package service

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// ConnectorField is one value a provider asks for.
type ConnectorField struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	// Secret values render masked; identifiers such as a shop id may show their tail plainly.
	Secret   bool `json:"secret"`
	Required bool `json:"required"`
}

// connectorFields lists what each provider needs. A provider not listed takes one API key.
var connectorFields = map[string][]ConnectorField{
	"Midtrans":           {{"server_key", "Server key", true, true}, {"client_key", "Client key", true, true}},
	"Xendit":             {{"secret_key", "Secret key", true, true}, {"callback_token", "Callback token", true, true}},
	"JNE":                {{"username", "Username", false, true}, {"api_key", "API key", true, true}},
	"SiCepat":            {{"api_key", "API key", true, true}},
	"GoSend":             {{"client_id", "Client ID", false, true}, {"client_secret", "Client secret", true, true}},
	"Accurate Online":    {{"client_id", "Client ID", false, true}, {"client_secret", "Client secret", true, true}},
	"WhatsApp Business":  {{"phone_number_id", "Phone number ID", false, true}, {"access_token", "Access token", true, true}},
	"Email (SMTP relay)": {{"username", "SMTP username", false, true}, {"password", "SMTP password", true, true}},
	"Shopee":             {{"partner_id", "Partner ID", false, true}, {"partner_key", "Partner key", true, true}, {"shop_id", "Shop ID", false, true}},
	"Tokopedia":          {{"client_id", "Client ID", false, true}, {"client_secret", "Client secret", true, true}},
}

var defaultConnectorFields = []ConnectorField{{"api_key", "API key", true, true}}

func fieldsOf(provider string) []ConnectorField {
	if fields, ok := connectorFields[provider]; ok {
		return fields
	}
	return defaultConnectorFields
}

// ConnectorFieldState is a field with what the console may know about its value.
type ConnectorFieldState struct {
	ConnectorField
	Set       bool    `json:"set"`
	Last4     *string `json:"last4"`
	UpdatedAt *string `json:"updatedAt"`
	UpdatedBy *string `json:"updatedBy"`
}

// ConnectorCredentials is the answer for one integration. It never carries a value.
type ConnectorCredentials struct {
	IntegrationID string                `json:"integrationId"`
	Provider      string                `json:"provider"`
	Complete      bool                  `json:"complete"`
	Fields        []ConnectorFieldState `json:"fields"`
}

func (s *Service) integrationFor(ctx context.Context, m Meta, id string) (domain.Integration, error) {
	i, err := store.Get[domain.Integration](ctx, s.DB.Pool, "integrations", id)
	if errors.Is(err, store.ErrNotFound) {
		return i, NotFound{What: "integration"}
	}
	if err != nil {
		return i, err
	}
	return i, access(m, i.TenantID)
}

// GetConnectorCredentials reports which values are set.
func (s *Service) GetConnectorCredentials(ctx context.Context, m Meta, id string) (*ConnectorCredentials, error) {
	i, err := s.integrationFor(ctx, m, id)
	if err != nil {
		return nil, err
	}
	rows, err := s.DB.Pool.Query(ctx, `select field, last4, updated_by, updated_at from connector_secrets where integration_id = $1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type stored struct {
		last4, by string
		at        time.Time
	}
	have := map[string]stored{}
	for rows.Next() {
		var field string
		var v stored
		if err := rows.Scan(&field, &v.last4, &v.by, &v.at); err != nil {
			return nil, err
		}
		have[field] = v
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := &ConnectorCredentials{IntegrationID: id, Provider: i.Provider, Complete: true, Fields: []ConnectorFieldState{}}
	for _, f := range fieldsOf(i.Provider) {
		state := ConnectorFieldState{ConnectorField: f}
		if v, ok := have[f.Key]; ok {
			state.Set = true
			state.Last4, state.UpdatedBy, state.UpdatedAt = ptr(v.last4), ptr(v.by), ptr(clock.Iso(v.at))
		} else if f.Required {
			out.Complete = false
		}
		out.Fields = append(out.Fields, state)
	}
	return out, nil
}

func tail(value string) string {
	r := []rune(value)
	if len(r) <= 8 {
		return "" // Too short to show any of it safely.
	}
	return string(r[len(r)-4:])
}

// SaveConnectorCredentials writes the values given: a string replaces, null clears, and a field left
// out keeps its value.
func (s *Service) SaveConnectorCredentials(ctx context.Context, m Meta, id string, values map[string]*string) (*ConnectorCredentials, error) {
	i, err := s.integrationFor(ctx, m, id)
	if err != nil {
		return nil, err
	}
	known := map[string]bool{}
	for _, f := range fieldsOf(i.Provider) {
		known[f.Key] = true
	}
	err = pgx.BeginFunc(ctx, s.DB.Pool, func(tx pgx.Tx) error {
		for field, value := range values {
			if !known[field] {
				return Invalid{Reason: i.Provider + " has no field " + field + "."}
			}
			if value == nil {
				tag, err := tx.Exec(ctx, `delete from connector_secrets where integration_id = $1 and field = $2`, id, field)
				if err != nil {
					return err
				}
				if tag.RowsAffected() > 0 {
					if err := logCredential(ctx, tx, m, i.TenantID, i.Provider+" · "+field, "cleared"); err != nil {
						return err
					}
				}
				continue
			}
			plain := strings.TrimSpace(*value)
			if plain == "" {
				continue
			}
			sealed, err := s.Vault.Seal(plain, sealContext(id, field))
			if err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `insert into connector_secrets (integration_id, field, ciphertext, last4, updated_by, updated_at)
				values ($1, $2, $3, $4, $5, $6)
				on conflict (integration_id, field) do update set ciphertext = excluded.ciphertext, last4 = excluded.last4,
					updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
				id, field, sealed, tail(plain), m.by(), m.At); err != nil {
				return err
			}
			if err := logCredential(ctx, tx, m, i.TenantID, i.Provider+" · "+field, "updated"); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.GetConnectorCredentials(ctx, m, id)
}

func sealContext(integrationID, field string) string { return integrationID + "/" + field }

// ConnectorValues decrypts an integration's values for an outbound call. No route returns them.
func (s *Service) ConnectorValues(ctx context.Context, integrationID string) (map[string]string, error) {
	rows, err := s.DB.Pool.Query(ctx, `select field, ciphertext from connector_secrets where integration_id = $1`, integrationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var field string
		var sealed []byte
		if err := rows.Scan(&field, &sealed); err != nil {
			return nil, err
		}
		plain, err := s.Vault.Open(sealed, sealContext(integrationID, field))
		if err != nil {
			return nil, err
		}
		out[field] = plain
	}
	return out, rows.Err()
}

// ConnectionResult is what a real call to the provider showed.
type ConnectionResult struct {
	// Outcome is ok, rejected, unreachable, incomplete or unsupported.
	Outcome string `json:"outcome"`
	Detail  string `json:"detail"`
	Ms      int    `json:"ms"`
}

// connectionProbes are read-only calls that prove a key works. Both answer 401 to a bad key.
var connectionProbes = map[string]func(values map[string]string) (url, user string){
	"Midtrans": func(v map[string]string) (string, string) {
		host := "https://api.midtrans.com"
		if strings.HasPrefix(v["server_key"], "SB-") {
			host = "https://api.sandbox.midtrans.com"
		}
		return host + "/v2/commerce-os-connection-test/status", v["server_key"]
	},
	"Xendit": func(v map[string]string) (string, string) {
		return "https://api.xendit.co/balance", v["secret_key"]
	},
}

// TestConnector calls the provider with the stored values and logs the outcome, never the values.
func (s *Service) TestConnector(ctx context.Context, m Meta, id string) (*ConnectionResult, *Delta, error) {
	state, err := s.GetConnectorCredentials(ctx, m, id)
	if err != nil {
		return nil, nil, err
	}
	probe, supported := connectionProbes[state.Provider]
	switch {
	case !state.Complete:
		return &ConnectionResult{Outcome: "incomplete", Detail: "Save every required value first."}, nil, nil
	case !supported:
		return &ConnectionResult{Outcome: "unsupported", Detail: "Commerce OS has no live check for " + state.Provider + " yet. The values are stored."}, nil, nil
	}
	values, err := s.ConnectorValues(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	target, user := probe(values)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, nil, err
	}
	req.SetBasicAuth(user, "")
	req.Header.Set("Accept", "application/json")
	start := time.Now()
	res, err := s.HTTP.Do(req)
	result := &ConnectionResult{Ms: int(time.Since(start).Milliseconds())}
	switch {
	case err != nil:
		result.Outcome, result.Detail = "unreachable", "Could not reach "+state.Provider+"."
	case res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden:
		result.Outcome, result.Detail = "rejected", state.Provider+" rejected these credentials."
	case res.StatusCode >= 500:
		result.Outcome, result.Detail = "unreachable", fmt.Sprintf("%s answered %d.", state.Provider, res.StatusCode)
	default:
		result.Outcome, result.Detail = "ok", state.Provider+" accepted these credentials."
	}
	if err == nil {
		res.Body.Close()
	}
	i, err := s.integrationFor(ctx, m, id)
	if err != nil {
		return nil, nil, err
	}
	delta, err := s.run(ctx, func(t *tx) error {
		entry := domain.IntegrationLog{
			ID: ids.New("log"), TenantID: i.TenantID, IntegrationID: id, At: m.At, Direction: "outbound",
			Event: "connection.test", Path: req.URL.Path, Ok: result.Outcome == "ok", Ms: result.Ms, Summary: result.Detail,
		}
		return t.put("integrationLogs", entry.ID, entry)
	})
	if err != nil {
		return nil, nil, err
	}
	return result, delta, nil
}
