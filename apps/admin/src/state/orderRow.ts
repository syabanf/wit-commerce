import type { OrderRow } from '@rc/api'
import { unitCount } from '@rc/fixtures'
import type { Order } from '@rc/types'

/** An order as the list shows it, built from the local dataset or read from the API's read model. */
export const toRow = (o: Order, customerName: string): OrderRow => ({
  id: o.id,
  code: o.code,
  customerId: o.customerId,
  customerName,
  customerCode: '',
  status: o.status,
  paymentStatus: o.paymentStatus,
  channel: o.channel,
  sellerId: o.sellerId,
  campaignId: o.campaignId,
  createdAt: o.createdAt,
  total: o.total,
  subtotal: o.subtotal,
  itemCount: unitCount(o.lines),
  agent: !!o.agent,
  refundedAmount: o.refundedAmount,
  paymentMethod: o.paymentMethod,
  paymentTypeId: o.paymentTypeId ?? null,
  shippedAt: o.events.find((e) => e.status === 'shipped')?.at ?? null,
  agentInfo: o.agent ?? null,
})
