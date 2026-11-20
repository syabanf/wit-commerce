package domain

// PaymentConfirmation is what a shopper reports after paying by manual transfer or static QRIS.
// Staff check it against the bank or wallet and confirm or reject it; only staff turn the order
// paid. Status is submitted (waiting for staff), confirmed or rejected.
type PaymentConfirmation struct {
	Amount int `json:"amount"`
	// Channel is the bank or wallet the money came from.
	Channel       string  `json:"channel"`
	SenderName    string  `json:"senderName"`
	TransferredAt IsoDate `json:"transferredAt"`
	ProofURL      string  `json:"proofUrl,omitempty"`
	SubmittedAt   IsoDate `json:"submittedAt"`
	Status        string  `json:"status"`
	ReviewedAt    IsoDate `json:"reviewedAt,omitempty"`
	ReviewedBy    string  `json:"reviewedBy,omitempty"`
	RejectReason  string  `json:"rejectReason,omitempty"`
}

// CancelRefund is the refund a cancelled paid order owes. Status is owed (nothing sent yet),
// pending (the gateway did not answer), failed (the gateway said no) or succeeded. Method is
// midtrans when the gateway refunded, manual when staff recorded a bank transfer.
type CancelRefund struct {
	Amount     int     `json:"amount"`
	Status     string  `json:"status"`
	Method     string  `json:"method,omitempty"`
	Reference  string  `json:"reference,omitempty"`
	RefundedOn IsoDate `json:"refundedOn,omitempty"`
	Error      string  `json:"error,omitempty"`
}
