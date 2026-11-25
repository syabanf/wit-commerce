import type { Order } from '@rc/types'
import type { StateResponse } from './index'

// GET /state sends open orders as list items (orderListItems in apps/api/internal/httpapi/
// order_list.go): null and zero values left out, the history cut to its shipments, and the detail
// fields (tax, discountLines, terms) only on GET /orders/{id}. This puts the left-out values back, so
// every screen keeps reading a whole Order. Keep these lists the same as the Go ones.
const NULLABLE = [
  'sellerId',
  'campaignId',
  'trackingNo',
  'voucherCode',
  'cancelReason',
  'paymentTypeId',
] as const
const ZERO = ['discount', 'shipping', 'refundedAmount', 'pointsEarned'] as const

/** An order list item with its left-out null, zero and empty values back. */
export function fromListItem(item: Partial<Order>): Order {
  const order: Record<string, unknown> = { ...item }
  for (const key of NULLABLE) order[key] ??= null
  for (const key of ZERO) order[key] ??= 0
  order.events ??= []
  return order as unknown as Order
}

/** The state answer with its orders made whole again. */
export function withListedOrders(res: StateResponse): StateResponse {
  const orders = res.state.orders
  if (!orders) return res
  return { ...res, state: { ...res.state, orders: orders.map(fromListItem) } }
}
