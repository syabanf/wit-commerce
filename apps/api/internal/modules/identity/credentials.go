package identity

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/ids"
)

// APIKeyPrefix marks a bearer token as an API credential.
const APIKeyPrefix = "rck_"

// Credential is an API key as the console sees it; the secret itself never leaves CreateCredential
// and RotateCredential.
type Credential struct {
	ID          string   `json:"id"`
	TenantID    string   `json:"tenantId"`
	Name        string   `json:"name"`
	Prefix      string   `json:"prefix"`
	Scopes      []string `json:"scopes"`
	Status      string   `json:"status"`
	CreatedBy   string   `json:"createdBy"`
	CreatedAt   string   `json:"createdAt"`
	ExpiresAt   *string  `json:"expiresAt"`
	RotatedAt   *string  `json:"rotatedAt"`
	RevokedAt   *string  `json:"revokedAt"`
	LastUsedAt  *string  `json:"lastUsedAt"`
	Requests24h int      `json:"requests24h"`
}

// CredentialEvent is one line of the audit trail.
type CredentialEvent struct {
	ID      int64  `json:"id"`
	Subject string `json:"subject"`
	Action  string `json:"action"`
	By      string `json:"by"`
	At      string `json:"at"`
}

// NewCredential is what the console sends to create a key.
type NewCredential struct {
	Name      string   `json:"name"`
	Scopes    []string `json:"scopes"`
	ExpiresAt *string  `json:"expiresAt"`
}

// IssuedCredential carries the secret, once.
type IssuedCredential struct {
	Credential Credential `json:"credential"`
	Secret     string     `json:"secret"`
}

func newSecret() (secret, prefix, hash string, err error) {
	raw := make([]byte, 32)
	if _, err = rand.Read(raw); err != nil {
		return
	}
	secret = APIKeyPrefix + base64.RawURLEncoding.EncodeToString(raw)
	return secret, secret[:len(APIKeyPrefix)+8], hashSecret(secret), nil
}

func hashSecret(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

const credentialColumns = `id, tenant_id, name, prefix, scopes, created_by, created_at, expires_at, rotated_at, revoked_at, last_used_at`

func scanCredential(row pgx.Row, now time.Time) (Credential, error) {
	var c Credential
	var createdAt time.Time
	var expires, rotated, revoked, used *time.Time
	if err := row.Scan(&c.ID, &c.TenantID, &c.Name, &c.Prefix, &c.Scopes, &c.CreatedBy, &createdAt, &expires, &rotated, &revoked, &used); err != nil {
		return c, err
	}
	c.CreatedAt = clock.Iso(createdAt)
	c.ExpiresAt, c.RotatedAt, c.RevokedAt, c.LastUsedAt = clock.IsoPtr(expires), clock.IsoPtr(rotated), clock.IsoPtr(revoked), clock.IsoPtr(used)
	switch {
	case revoked != nil:
		c.Status = "revoked"
	case expires != nil && !expires.After(now):
		c.Status = "expired"
	default:
		c.Status = "active"
	}
	return c, nil
}

// ListCredentials returns a tenant's keys, newest first, with their traffic, and the audit trail.
func (s *Identity) ListCredentials(ctx context.Context, m kernel.Meta, tenantID string) ([]Credential, []CredentialEvent, error) {
	if err := kernel.Access(m, tenantID); err != nil {
		return nil, nil, err
	}
	rows, err := s.DB.Pool.Query(ctx, `select `+credentialColumns+` from api_credentials where tenant_id = $1 order by created_at desc, id`, tenantID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	credentials := []Credential{}
	for rows.Next() {
		c, err := scanCredential(rows, s.Clock.Now())
		if err != nil {
			return nil, nil, err
		}
		credentials = append(credentials, c)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	for i := range credentials {
		if err := s.DB.Pool.QueryRow(ctx, `select count(*) from request_log where principal = $1 and at > now() - interval '24 hours'`,
			string(auth.KindAPIKey)+":"+credentials[i].ID).Scan(&credentials[i].Requests24h); err != nil {
			return nil, nil, err
		}
	}
	events, err := s.DB.Pool.Query(ctx, `select id, subject, action, by, at from credential_events where tenant_id = $1 order by id desc limit 50`, tenantID)
	if err != nil {
		return nil, nil, err
	}
	defer events.Close()
	trail := []CredentialEvent{}
	for events.Next() {
		var e CredentialEvent
		var at time.Time
		if err := events.Scan(&e.ID, &e.Subject, &e.Action, &e.By, &at); err != nil {
			return nil, nil, err
		}
		e.At = clock.Iso(at)
		trail = append(trail, e)
	}
	return credentials, trail, events.Err()
}

// CreateCredential issues a key; the answer holds the only copy of the secret.
func (s *Identity) CreateCredential(ctx context.Context, m kernel.Meta, tenantID string, in NewCredential) (*IssuedCredential, error) {
	if err := kernel.Access(m, tenantID); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" || len(name) > 80 {
		return nil, kernel.Invalid{Reason: "Name the system that will use this key, in 80 characters or fewer."}
	}
	if len(in.Scopes) == 0 {
		return nil, kernel.Invalid{Reason: "Choose at least one scope."}
	}
	for _, scope := range in.Scopes {
		if !auth.ValidScope(scope) {
			return nil, kernel.Invalid{Reason: "Unknown scope: " + scope}
		}
	}
	var expires *time.Time
	if in.ExpiresAt != nil && *in.ExpiresAt != "" {
		t, err := clock.Parse(*in.ExpiresAt)
		if err != nil || !t.After(s.Clock.Now()) {
			return nil, kernel.Invalid{Reason: "Choose an expiry date in the future."}
		}
		expires = &t
	}
	secret, prefix, hash, err := newSecret()
	if err != nil {
		return nil, err
	}
	id := ids.New("cred")
	var c Credential
	err = pgx.BeginFunc(ctx, s.DB.Pool, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `insert into api_credentials (id, tenant_id, name, prefix, secret_hash, scopes, created_by, created_at, expires_at)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning `+credentialColumns,
			id, tenantID, name, prefix, hash, in.Scopes, m.By(), m.At, expires)
		var err error
		if c, err = scanCredential(row, s.Clock.Now()); err != nil {
			return err
		}
		return kernel.LogCredential(ctx, tx, m, tenantID, name, "created")
	})
	if err != nil {
		return nil, err
	}
	return &IssuedCredential{Credential: c, Secret: secret}, nil
}

// lockCredential locks a key's row and checks access to its tenant.
func (s *Identity) lockCredential(ctx context.Context, tx pgx.Tx, m kernel.Meta, id string) (Credential, error) {
	c, err := scanCredential(tx.QueryRow(ctx, `select `+credentialColumns+` from api_credentials where id = $1 for update`, id), s.Clock.Now())
	if errors.Is(err, pgx.ErrNoRows) {
		return c, kernel.NotFound{What: "credential"}
	}
	if err != nil {
		return c, err
	}
	return c, kernel.Access(m, c.TenantID)
}

// RotateCredential replaces the secret; the old one stops working at once.
func (s *Identity) RotateCredential(ctx context.Context, m kernel.Meta, id string) (*IssuedCredential, error) {
	secret, prefix, hash, err := newSecret()
	if err != nil {
		return nil, err
	}
	var c Credential
	err = pgx.BeginFunc(ctx, s.DB.Pool, func(tx pgx.Tx) error {
		current, err := s.lockCredential(ctx, tx, m, id)
		if err != nil {
			return err
		}
		if current.Status == "revoked" {
			return kernel.Refuse("This key is revoked. Create a new one instead.")
		}
		row := tx.QueryRow(ctx, `update api_credentials set prefix = $2, secret_hash = $3, rotated_at = $4 where id = $1 returning `+credentialColumns,
			id, prefix, hash, m.At)
		if c, err = scanCredential(row, s.Clock.Now()); err != nil {
			return err
		}
		return kernel.LogCredential(ctx, tx, m, c.TenantID, c.Name, "rotated")
	})
	if err != nil {
		return nil, err
	}
	return &IssuedCredential{Credential: c, Secret: secret}, nil
}

// RevokeCredential stops a key for good.
func (s *Identity) RevokeCredential(ctx context.Context, m kernel.Meta, id string) (*Credential, error) {
	var c Credential
	err := pgx.BeginFunc(ctx, s.DB.Pool, func(tx pgx.Tx) error {
		current, err := s.lockCredential(ctx, tx, m, id)
		if err != nil {
			return err
		}
		if current.Status == "revoked" {
			c = current
			return nil
		}
		row := tx.QueryRow(ctx, `update api_credentials set revoked_at = $2 where id = $1 returning `+credentialColumns, id, m.At)
		if c, err = scanCredential(row, s.Clock.Now()); err != nil {
			return err
		}
		return kernel.LogCredential(ctx, tx, m, c.TenantID, c.Name, "revoked")
	})
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// Authenticate resolves an API key to its principal. Any failure reads the same to the caller.
func (s *Identity) Authenticate(ctx context.Context, secret string) (auth.Principal, bool) {
	var id, tenantID string
	var scopes []string
	err := s.DB.Pool.QueryRow(ctx, `select id, tenant_id, scopes from api_credentials
		where secret_hash = $1 and revoked_at is null and (expires_at is null or expires_at > $2)`,
		hashSecret(secret), s.Clock.Now()).Scan(&id, &tenantID, &scopes)
	if err != nil {
		return auth.Principal{}, false
	}
	// At most one write a minute per key, so traffic does not turn into row churn.
	if _, err := s.DB.Pool.Exec(ctx, `update api_credentials set last_used_at = $2::timestamptz
		where id = $1 and (last_used_at is null or last_used_at < $2::timestamptz - interval '1 minute')`, id, s.Clock.Now()); err != nil {
		return auth.Principal{}, false
	}
	return auth.Principal{Kind: auth.KindAPIKey, ID: id, TenantIDs: []string{tenantID}, Scopes: scopes}, true
}
