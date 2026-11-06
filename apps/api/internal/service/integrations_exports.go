package service

import "github.com/syabanf/wit-commerce/apps/api/internal/modules/integrations"

// The integrations module's types and functions under the names the HTTP layer and the tests use.
type (
	ConnectorField       = integrations.ConnectorField
	ConnectorFieldState  = integrations.ConnectorFieldState
	ConnectorCredentials = integrations.ConnectorCredentials
	ConnectionResult     = integrations.ConnectionResult
	WebhookEndpoint      = integrations.WebhookEndpoint
	WebhookDelivery      = integrations.WebhookDelivery
	NewWebhook           = integrations.NewWebhook
	IssuedWebhook        = integrations.IssuedWebhook
)

var (
	WebhookEvents  = integrations.WebhookEvents
	Sign           = integrations.Sign
	OutboundClient = integrations.OutboundClient
)
