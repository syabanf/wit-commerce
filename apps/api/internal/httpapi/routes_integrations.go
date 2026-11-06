package httpapi

// integrationRoutes registers integration toggles and syncs.
func (s *Server) integrationRoutes(rt *router) {
	rt.add("POST", "/integrations/{id}/toggle", "integrations/toggle", "integration.manage", "Turn an integration on or off", idOnly(s, s.svc.ToggleIntegration))
	rt.add("POST", "/integrations/{id}/sync", "integrations/sync", "integration.manage", "Sync an integration now", idOnly(s, s.svc.SyncIntegration))
}

// connectivityRoutes registers API keys, connector credentials and outbound webhooks. Only people with integration.manage reach them; API keys hold no scope for it.
func (s *Server) connectivityRoutes(rt *router) {
	rt.add("GET", "/tenants/{id}/credentials", "", "integration.manage", "API keys, the scope catalog and the audit trail of a tenant", s.listCredentials)
	rt.add("POST", "/tenants/{id}/credentials", "", "integration.manage", "Create an API key; the answer holds the only copy of the secret", s.createCredential)
	rt.add("POST", "/credentials/{id}/rotate", "", "integration.manage", "Replace a key's secret; the old one stops at once", s.rotateCredential)
	rt.add("POST", "/credentials/{id}/revoke", "", "integration.manage", "Stop a key for good", s.revokeCredential)
	rt.add("GET", "/integrations/{id}/credentials", "", "integration.manage", "Which connector values are set, never the values", s.getConnectorCredentials)
	rt.add("PUT", "/integrations/{id}/credentials", "", "integration.manage", "Set or clear connector values; they are stored encrypted", s.saveConnectorCredentials)

	rt.add("POST", "/integrations/{id}/credentials/test", "", "integration.manage", "Call the provider with the stored values and report the outcome", s.testConnector)

	// Outbound webhooks (people with integration.manage only)
	rt.add("GET", "/tenants/{id}/webhooks", "", "integration.manage", "Webhook endpoints, the event catalog and the latest deliveries", s.listWebhooks)
	rt.add("POST", "/tenants/{id}/webhooks", "", "integration.manage", "Add an endpoint; the answer holds the only copy of the signing secret", s.createWebhook)
	rt.add("POST", "/webhooks/{id}/enabled", "", "integration.manage", "Pause or resume an endpoint", s.setWebhookEnabled)
	rt.add("POST", "/webhooks/{id}/rotate", "", "integration.manage", "Replace an endpoint's signing secret", s.rotateWebhook)
	rt.add("POST", "/webhooks/{id}/test", "", "integration.manage", "Queue a webhook.test event for an endpoint", s.pingWebhook)
	rt.add("DELETE", "/webhooks/{id}", "", "integration.manage", "Remove an endpoint and its deliveries", s.deleteWebhook)
	rt.add("POST", "/webhook-deliveries/{id}/retry", "", "integration.manage", "Send a failed delivery again", s.retryDelivery)
}
