package auth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
)

// Vault encrypts connector secrets with AES-256-GCM. The associated data binds each ciphertext to
// its row, so a value copied to another integration or field does not decrypt.
type Vault struct {
	aead cipher.AEAD
}

// NewVault takes a base64-encoded 32-byte key (CREDENTIALS_KEY).
func NewVault(encoded string) (*Vault, error) {
	key, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(key) != 32 {
		return nil, errors.New("CREDENTIALS_KEY must be 32 bytes in base64: openssl rand -base64 32")
	}
	return newVault(key)
}

// DeriveVault makes a key from another secret, for development without CREDENTIALS_KEY.
func DeriveVault(secret string) (*Vault, error) {
	key := sha256.Sum256([]byte("commerce-os/connector-secrets/" + secret))
	return newVault(key[:])
}

func newVault(key []byte) (*Vault, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Vault{aead: aead}, nil
}

// Seal returns nonce + ciphertext.
func (v *Vault) Seal(plaintext, associated string) ([]byte, error) {
	nonce := make([]byte, v.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return v.aead.Seal(nonce, nonce, []byte(plaintext), []byte(associated)), nil
}

// Open reverses Seal; it fails on a wrong key, a tampered value or another row's value.
func (v *Vault) Open(sealed []byte, associated string) (string, error) {
	size := v.aead.NonceSize()
	if len(sealed) < size {
		return "", errors.New("sealed value is too short")
	}
	plain, err := v.aead.Open(nil, sealed[:size], sealed[size:], []byte(associated))
	return string(plain), err
}
