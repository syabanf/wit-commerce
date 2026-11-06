package service

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"

	"github.com/syabanf/wit-commerce/apps/api/internal/auth"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/integrations"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Online payments cross modules: the payment type is the catalog's, the keys and the provider
// client are integrations', and the order is the orders module's. The facade joins them.

// Payment is an order's online payment record.
type Payment = integrations.Payment

// ErrBadSignature is a payment notification that does not prove it came from the provider.
var ErrBadSignature = errors.New("the notification signature does not match")

// onlinePayments answers the orders module's question from payment types and integrations.
type onlinePayments struct {
	rt   *kernel.Runtime
	ints *integrations.Integrations
}

// CollectsOnline is true for a Midtrans payment type in a tenant whose Midtrans integration is on
// with a server key saved. A zero total has nothing to collect.
func (p onlinePayments) CollectsOnline(ctx context.Context, tenantID, paymentTypeID string, total int) (bool, error) {
	if total <= 0 {
		return false, nil
	}
	pt, err := store.Get[domain.PaymentType](ctx, p.rt.DB.Pool, "paymentTypes", paymentTypeID)
	if errors.Is(err, store.ErrNotFound) || err == nil && (pt.TenantID != tenantID || pt.Provider != "Midtrans") {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return p.ints.MidtransReady(ctx, tenantID)
}

// OnlinePaymentTypes lists the ids of the tenant's payment types a provider collects online, so the
// storefront can tell the shopper they pay on the provider's page.
func (s *Service) OnlinePaymentTypes(ctx context.Context, tenantID string) ([]string, error) {
	ids := []string{}
	if ready, err := s.MidtransReady(ctx, tenantID); err != nil || !ready {
		return ids, err
	}
	types, err := store.ListTenant[domain.PaymentType](ctx, s.DB.Pool, "paymentTypes", tenantID)
	if err != nil {
		return nil, err
	}
	for _, t := range types {
		if t.Provider == "Midtrans" && t.Method != "cod" {
			ids = append(ids, t.ID)
		}
	}
	return ids, nil
}

// StartPayment creates the provider transaction for an order waiting for an online payment and
// returns it; an order that already has one gets that one back. It returns nil when the order does
// not wait for an online payment. finishURL is where the provider sends the shopper afterwards.
func (s *Service) StartPayment(ctx context.Context, orderID, finishURL string) (*Payment, error) {
	o, err := store.Get[domain.Order](ctx, s.DB.Pool, "orders", orderID)
	if err != nil {
		return nil, err
	}
	if o.PaymentStatus != "pending" || o.PaymentTypeID == nil {
		return nil, nil
	}
	if existing, err := s.PaymentFor(ctx, orderID); err != nil || existing != nil {
		return existing, err
	}
	pt, err := store.Get[domain.PaymentType](ctx, s.DB.Pool, "paymentTypes", *o.PaymentTypeID)
	if err != nil || pt.Provider != "Midtrans" {
		return nil, nil
	}
	key, err := s.MidtransServerKey(ctx, o.TenantID)
	if err != nil || key == "" {
		return nil, err
	}
	req := integrations.SnapRequest{
		TransactionDetails: integrations.SnapTransaction{OrderID: o.ID, GrossAmount: o.Total},
		ItemDetails:        s.snapItems(ctx, o),
		EnabledPayments:    snapPayments(pt),
	}
	if c, err := store.Get[domain.Customer](ctx, s.DB.Pool, "customers", o.CustomerID); err == nil {
		req.CustomerDetails = &integrations.SnapCustomer{FirstName: clip(c.Name), Email: c.Email, Phone: c.Phone}
	}
	if finishURL != "" {
		req.Callbacks = &integrations.SnapCallbacks{Finish: finishURL}
	}
	return s.StartMidtransPayment(ctx, o.TenantID, key, req, s.Clock.NowIso())
}

// snapItems lists the order's lines, shipping and discount so they add up to its total, as Snap
// requires.
func (s *Service) snapItems(ctx context.Context, o domain.Order) []integrations.SnapItem {
	var items []integrations.SnapItem
	sum := 0
	for _, l := range o.Lines {
		name := "Item"
		if p, err := store.Get[domain.Product](ctx, s.DB.Pool, "products", l.ProductID); err == nil {
			name = p.Name
		}
		items = append(items, integrations.SnapItem{ID: l.VariantID, Price: l.Price, Quantity: l.Qty, Name: clip(name)})
		sum += l.Price * l.Qty
	}
	if o.Shipping > 0 {
		items = append(items, integrations.SnapItem{ID: "shipping", Price: o.Shipping, Quantity: 1, Name: "Shipping"})
		sum += o.Shipping
	}
	if o.Discount > 0 {
		items = append(items, integrations.SnapItem{ID: "discount", Price: -o.Discount, Quantity: 1, Name: "Discount"})
		sum -= o.Discount
	}
	// Rounding in the cart, or a total floored at zero, can leave a gap; one line closes it.
	if gap := o.Total - sum; gap != 0 {
		items = append(items, integrations.SnapItem{ID: "adjustment", Price: gap, Quantity: 1, Name: "Adjustment"})
	}
	return items
}

// clip keeps a name within Midtrans's 50 characters.
func clip(s string) string {
	if r := []rune(s); len(r) > 50 {
		return string(r[:50])
	}
	return s
}

// snapPayments narrows the Snap page to the method the shopper chose, when Snap names it.
func snapPayments(pt domain.PaymentType) []string {
	name := strings.ToLower(pt.Name)
	switch pt.Method {
	case "qris":
		return []string{"other_qris"}
	case "credit_card":
		return []string{"credit_card"}
	case "ewallet":
		switch {
		case strings.Contains(name, "gopay"):
			return []string{"gopay"}
		case strings.Contains(name, "shopeepay"):
			return []string{"shopeepay"}
		}
	case "va":
		for bank, code := range map[string]string{"bca": "bca_va", "bni": "bni_va", "bri": "bri_va", "permata": "permata_va", "mandiri": "echannel"} {
			if strings.Contains(name, bank) {
				return []string{code}
			}
		}
		return []string{"other_va"}
	}
	return nil
}

// MidtransNotification handles a Midtrans payment notification. It checks the signature with the
// brand's key, asks Midtrans for the status rather than trusting the body, records it and moves the
// order: paid on settlement or an accepted capture, cancelled on expire, cancel or deny. The order
// actions ignore an order that already moved, so a repeated notification changes nothing.
func (s *Service) MidtransNotification(ctx context.Context, body []byte) (*Delta, error) {
	var n integrations.MidtransNotification
	if err := json.Unmarshal(body, &n); err != nil || n.OrderID == "" {
		return nil, Invalid{Reason: "The notification is not a Midtrans notification."}
	}
	p, err := s.PaymentFor(ctx, n.OrderID)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, NotFound{What: "payment"}
	}
	key, err := s.MidtransServerKey(ctx, p.TenantID)
	if err != nil {
		return nil, err
	}
	if key == "" || !integrations.MidtransSignatureValid(n, key) {
		return nil, ErrBadSignature
	}
	st, err := s.MidtransStatus(ctx, key, n.OrderID)
	if err != nil {
		return nil, err
	}
	at := s.Clock.NowIso()
	if err := s.RecordMidtransStatus(ctx, st, body, at); err != nil {
		return nil, err
	}
	m := Meta{P: auth.System, At: at}
	// Money for another amount than the order's is no payment of this order.
	if amount, err := strconv.ParseFloat(st.GrossAmount, 64); err != nil || int(amount) != p.GrossAmount {
		return kernel.NewDelta(), nil
	}
	switch st.TransactionStatus {
	case "settlement":
		return s.ConfirmPayment(ctx, m, p.OrderID)
	case "capture":
		if st.FraudStatus == "accept" {
			return s.ConfirmPayment(ctx, m, p.OrderID)
		}
	case "expire":
		return s.FailPayment(ctx, m, p.OrderID, "payment_expired", "Midtrans: the payment expired")
	case "cancel":
		return s.FailPayment(ctx, m, p.OrderID, "payment_expired", "Midtrans: the payment was cancelled")
	case "deny":
		return s.FailPayment(ctx, m, p.OrderID, "fraud_check", "Midtrans: the payment was denied")
	}
	return kernel.NewDelta(), nil
}
