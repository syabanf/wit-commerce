package domain

// PrivacyRequest is a shopper's request about their personal data, kept in privacy_requests. Kind is
// access, correction, erasure or withdraw_consent; Status is open or completed.
type PrivacyRequest struct {
	ID          string   `json:"id"`
	TenantID    string   `json:"tenantId"`
	CustomerID  string   `json:"customerId"`
	Kind        string   `json:"kind"`
	Status      string   `json:"status"`
	RequestedAt IsoDate  `json:"requestedAt"`
	DueAt       IsoDate  `json:"dueAt"`
	CompletedAt *IsoDate `json:"completedAt"`
	HandledBy   *string  `json:"handledBy"`
	Note        string   `json:"note"`
}
