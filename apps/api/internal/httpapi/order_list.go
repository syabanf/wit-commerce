package httpapi

import (
	"encoding/json"
	"slices"
)

// The open orders in GET /state come as list items: the queues, badges, lists and dashboard read
// them, and the detail page reads the whole order (GET /orders/{id}). withListedOrders in
// packages/api puts the left-out values back, so the console sees the Order type unchanged; keep
// these lists the same as its own.
var (
	// orderListDetail are only on the detail page and the documents.
	orderListDetail = []string{"tax", "discountLines", "termsVersion", "termsAcceptedAt"}
	// orderListNullable are left out when null.
	orderListNullable = []string{"sellerId", "campaignId", "trackingNo", "voucherCode", "cancelReason", "paymentTypeId"}
	// orderListZero are left out when 0.
	orderListZero = []string{"discount", "shipping", "refundedAmount", "pointsEarned"}
)

// orderListItems turns each order into its list item: the history keeps only the shipped events,
// which the part lists and the dashboard count, and the fields above go when they say nothing.
func orderListItems(rows []json.RawMessage) error {
	for i, raw := range rows {
		var order map[string]json.RawMessage
		if err := json.Unmarshal(raw, &order); err != nil {
			return err
		}
		for key, value := range order {
			v := string(value)
			if slices.Contains(orderListDetail, key) || v == "null" && slices.Contains(orderListNullable, key) ||
				v == "0" && slices.Contains(orderListZero, key) {
				delete(order, key)
			}
		}
		var history []struct {
			Status *string `json:"status"`
		}
		var all []json.RawMessage
		if err := json.Unmarshal(order["events"], &history); err != nil {
			return err
		}
		if err := json.Unmarshal(order["events"], &all); err != nil {
			return err
		}
		var shipped []json.RawMessage
		for j, e := range history {
			if e.Status != nil && *e.Status == "shipped" {
				shipped = append(shipped, all[j])
			}
		}
		delete(order, "events")
		if len(shipped) > 0 {
			trimmed, err := json.Marshal(shipped)
			if err != nil {
				return err
			}
			order["events"] = trimmed
		}
		var err error
		if rows[i], err = json.Marshal(order); err != nil {
			return err
		}
	}
	return nil
}
