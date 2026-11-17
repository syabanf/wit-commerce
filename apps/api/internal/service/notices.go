package service

import (
	"context"
	"fmt"
	"slices"

	"github.com/jackc/pgx/v5"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/notifications"
	"github.com/syabanf/wit-commerce/apps/api/internal/store"
)

// Shopper emails cross modules: the order and return are the orders module's, the brand is
// identity's, the shopper is crm's, names and payment types are the catalog's, and the email is
// notifications'. The facade joins them, inside the action's transaction (kernel.Runtime.Notices).

// noticeSetting is the brand switch each notice kind answers to.
var noticeSetting = map[string]string{
	"order_placed":     "order_placed",
	"payment_received": "payment_received",
	"order_shipped":    "order_shipped",
	"order_cancelled":  "order_cancelled",
	"order_refunded":   "order_cancelled",
	"return_approved":  "return_update",
	"return_refunded":  "return_update",
}

// courierLabel mirrors COURIER_LABEL in packages/types for the couriers stores offer.
var courierLabel = map[string]string{
	"jne": "JNE", "jnt": "J&T", "sicepat": "SiCepat", "grab": "GrabExpress", "gojek": "GoSend", "lalamove": "Lalamove",
	"pickup": "Store pickup",
}

// ShopperNotices queues shopper email through notifications. Email off, a brand switch turned off or
// a shopper without an address means no email.
type ShopperNotices struct {
	N *notifications.Notifications
	// online says whether a provider collects a payment type online.
	online func(ctx context.Context, tenantID, paymentTypeID string, total int) (bool, error)
}

// UseShopperNotices sends the shopper emails of every action through n from now on.
func (s *Service) UseShopperNotices(n *notifications.Notifications) {
	s.Notices = ShopperNotices{N: n, online: s.Orders.Payments.CollectsOnline}
}

// QueueNotices implements kernel.NoticeSink.
func (sn ShopperNotices) QueueNotices(ctx context.Context, tx pgx.Tx, notices []kernel.Notice) error {
	if sn.N == nil || !sn.N.On() {
		return nil
	}
	for _, n := range notices {
		if err := sn.queue(ctx, tx, n); err != nil {
			return fmt.Errorf("shopper email %s: %w", n.Kind, err)
		}
	}
	return nil
}

func (sn ShopperNotices) queue(ctx context.Context, tx pgx.Tx, n kernel.Notice) error {
	o := n.Order
	tenant, err := store.Get[domain.Tenant](ctx, tx, "tenants", o.TenantID)
	if err != nil {
		return err
	}
	if slices.Contains(tenant.ShopperEmailsOff, noticeSetting[n.Kind]) {
		return nil
	}
	customer, err := store.Get[domain.Customer](ctx, tx, "customers", o.CustomerID)
	if err != nil || customer.Email == "" {
		return nil
	}
	storeURL := sn.N.StoreURL(tenant)
	f := notifications.ShopperFacts{
		Brand: notifications.StoreBranding(tenant, storeURL, sn.N.PublicURL), To: customer.Email, CustomerName: customer.Name,
		OrderCode: o.Code, OrderURL: storeURL + "/order/" + o.ID, Subtotal: o.Subtotal, Discount: o.Discount,
		Shipping: o.Shipping, Total: o.Total, Amount: n.Amount, Courier: courierLabel[o.Courier],
		CashOnDelivery: o.PaymentMethod == "cod",
	}
	if f.Courier == "" {
		f.Courier = o.Courier
	}
	if o.TrackingNo != nil {
		f.TrackingNo = *o.TrackingNo
	}
	names := func(variantID, productID string, qty int, amount string) notifications.Line {
		name := "Item"
		detail := fmt.Sprintf("Qty %d", qty)
		if p, err := store.Get[domain.Product](ctx, tx, "products", productID); err == nil {
			name = p.Name
			for _, v := range p.Variants {
				if v.ID == variantID && v.Name != "Standard" {
					detail = v.Name + " · " + detail
				}
			}
		}
		return notifications.Line{Name: name, Detail: detail, Amount: amount}
	}
	key := n.Kind + ":" + o.ID
	switch n.Kind {
	case "order_placed":
		for _, l := range o.Lines {
			f.Lines = append(f.Lines, names(l.VariantID, l.ProductID, l.Qty, notifications.Rupiah(l.Qty*l.Price)))
		}
		f.AwaitingPayment = o.PaymentStatus == "pending" && o.PaymentMethod != "cod"
		if f.AwaitingPayment && o.PaymentTypeID != nil {
			if f.PayOnline, err = sn.online(ctx, o.TenantID, *o.PaymentTypeID, o.Total); err != nil {
				return err
			}
			if pt, err := store.Get[domain.PaymentType](ctx, tx, "paymentTypes", *o.PaymentTypeID); err == nil && !f.PayOnline {
				f.PaymentInstructions = pt.Instructions
			}
		}
	case "order_refunded":
		// Each partial refund is its own event: the total refunded so far tells them apart.
		key = fmt.Sprintf("%s:%d", key, o.RefundedAmount)
	case "return_approved", "return_refunded":
		f.ReturnCode = n.Return.Code
		key = n.Kind + ":" + n.Return.ID
		for _, item := range n.Return.Items {
			f.Lines = append(f.Lines, names(item.VariantID, item.ProductID, item.Qty, returnReasonLabel[item.Reason]))
		}
	}
	m, ok := notifications.ComposeShopper(n.Kind, f)
	if !ok {
		return nil
	}
	return notifications.QueueShopper(ctx, tx, key, n.Kind, m)
}

// returnReasonLabel mirrors RETURN_REASON_LABEL in packages/types.
var returnReasonLabel = map[string]string{
	"damaged": "Arrived damaged", "wrong_item": "Wrong item sent", "not_as_described": "Not as described",
	"size_or_fit": "Size or fit", "changed_mind": "Changed my mind",
}
