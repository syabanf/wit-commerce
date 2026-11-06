package service

import "github.com/syabanf/wit-commerce/apps/api/internal/modules/identity"

// The identity module's API credential types under the names the HTTP layer uses.
type (
	Credential       = identity.Credential
	CredentialEvent  = identity.CredentialEvent
	NewCredential    = identity.NewCredential
	IssuedCredential = identity.IssuedCredential
)

// APIKeyPrefix marks a bearer token as an API credential.
const APIKeyPrefix = identity.APIKeyPrefix
