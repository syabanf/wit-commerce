// Package auth signs and checks the API's tokens and passwords with the standard library only:
// HS256 JSON Web Tokens and PBKDF2-SHA256 password hashes.
package auth

import (
	"context"
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Kind says what a token stands for.
type Kind string

const (
	KindUser     Kind = "user"     // a console or seller-app user
	KindCustomer Kind = "customer" // a storefront shopper
	KindAPIKey   Kind = "apikey"   // an outside system with an API credential; never a JWT
	KindSystem   Kind = "system"   // server jobs; never issued as a token
)

// Principal is who a request acts as. Handlers read it from the context.
type Principal struct {
	Kind      Kind     `json:"kind"`
	ID        string   `json:"sub"`
	Role      string   `json:"role,omitempty"`
	TenantIDs []string `json:"tenantIds,omitempty"`
	// Customers belong to one store.
	TenantID string `json:"tenantId,omitempty"`
	// API keys act only within these scopes.
	Scopes []string `json:"scopes,omitempty"`
}

// System is the principal server jobs run as.
var System = Principal{Kind: KindSystem, ID: "system"}

// CanAccess reports whether the principal may touch a tenant's data.
func (p Principal) CanAccess(tenantID string) bool {
	switch p.Kind {
	case KindSystem:
		return true
	case KindCustomer:
		return p.TenantID == tenantID
	}
	if p.Role == "platform_admin" {
		return true
	}
	for _, id := range p.TenantIDs {
		if id == tenantID {
			return true
		}
	}
	return false
}

// By is the actor name stored on events: the user id, the customer id, or "system".
func (p Principal) By() string {
	if p.Kind == KindCustomer {
		return "storefront"
	}
	return p.ID
}

type claims struct {
	Principal
	Exp int64 `json:"exp"`
	Iat int64 `json:"iat"`
}

// Signer issues and verifies tokens with one HMAC secret.
type Signer struct {
	secret []byte
	ttl    time.Duration
}

// NewSigner needs a secret of at least 32 bytes.
func NewSigner(secret string, ttl time.Duration) (*Signer, error) {
	if len(secret) < 32 {
		return nil, errors.New("JWT_SECRET must be at least 32 characters")
	}
	return &Signer{secret: []byte(secret), ttl: ttl}, nil
}

var b64 = base64.RawURLEncoding

// Sign returns a token for the principal that expires after the signer's TTL.
func (s *Signer) Sign(p Principal, now time.Time) (string, time.Time, error) {
	exp := now.Add(s.ttl)
	header := b64.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	body, err := json.Marshal(claims{Principal: p, Exp: exp.Unix(), Iat: now.Unix()})
	if err != nil {
		return "", time.Time{}, err
	}
	signing := header + "." + b64.EncodeToString(body)
	return signing + "." + s.mac(signing), exp, nil
}

// Verify checks the signature and expiry and returns the principal.
func (s *Signer) Verify(token string, now time.Time) (Principal, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return Principal{}, errors.New("malformed token")
	}
	if subtle.ConstantTimeCompare([]byte(s.mac(parts[0]+"."+parts[1])), []byte(parts[2])) != 1 {
		return Principal{}, errors.New("bad signature")
	}
	body, err := b64.DecodeString(parts[1])
	if err != nil {
		return Principal{}, errors.New("malformed token")
	}
	var c claims
	if err := json.Unmarshal(body, &c); err != nil {
		return Principal{}, errors.New("malformed token")
	}
	if now.Unix() >= c.Exp {
		return Principal{}, errors.New("token expired")
	}
	if c.Kind != KindUser && c.Kind != KindCustomer {
		return Principal{}, errors.New("this kind of token is not accepted")
	}
	return c.Principal, nil
}

func (s *Signer) mac(signing string) string {
	h := hmac.New(sha256.New, s.secret)
	h.Write([]byte(signing))
	return b64.EncodeToString(h.Sum(nil))
}

const (
	pbkdfIterations = 600_000
	pbkdfKeyLen     = 32
)

// HashPassword returns "pbkdf2-sha256$iterations$salt$hash".
func HashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key, err := pbkdf2.Key(sha256.New, password, salt, pbkdfIterations, pbkdfKeyLen)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("pbkdf2-sha256$%d$%s$%s", pbkdfIterations, b64.EncodeToString(salt), b64.EncodeToString(key)), nil
}

// CheckPassword reports whether the password matches the stored hash.
func CheckPassword(hash, password string) bool {
	parts := strings.Split(hash, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2-sha256" {
		return false
	}
	iterations, err := strconv.Atoi(parts[1])
	if err != nil {
		return false
	}
	salt, err := b64.DecodeString(parts[2])
	if err != nil {
		return false
	}
	want, err := b64.DecodeString(parts[3])
	if err != nil {
		return false
	}
	got, err := pbkdf2.Key(sha256.New, password, salt, iterations, len(want))
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(got, want) == 1
}

type ctxKey struct{}

// WithPrincipal stores the principal on the context.
func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, ctxKey{}, p)
}

// From reads the principal; ok is false for anonymous requests.
func From(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(ctxKey{}).(Principal)
	return p, ok
}
