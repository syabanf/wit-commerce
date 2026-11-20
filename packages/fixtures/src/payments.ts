import type { Order } from '@rc/types'
import { toMs } from './dates'

// The server alone decides that an order is paid. A shopper's order arrives waiting for payment, a
// manual transfer or static QRIS payment is the shopper's claim until staff confirm it, and Midtrans
// says so only through a verified status. apps/api/internal/rules/payments.go mirrors this file.

/** What the shopper reports after paying by manual transfer or static QRIS. */
export interface PaymentConfirmationInput {
  amount: number
  /** The bank or wallet the money came from. */
  channel: string
  senderName: string
  transferredAt: string
  proofUrl?: string
}

/**
 * The order a shopper may place: open and waiting for payment, whatever the browser sent. Cash on
 * delivery turns paid on delivery, a gateway from its verified status, a transfer once staff confirm.
 */
export function shopperPlacement(order: Order): Order {
  const { paymentConfirmation: _pc, cancelRefund: _refund, ...rest } = order
  return {
    ...rest,
    status: order.status === 'new' || order.status === 'confirmed' ? order.status : 'confirmed',
    paymentStatus: 'pending',
    refundedAmount: 0,
    cancelReason: null,
    trackingNo: null,
    events: order.events.filter((e) => e.status === null || e.status === 'new' || e.status === 'confirmed'),
  }
}

/** An open order whose payment has not arrived. */
export const awaitsPayment = (order: Order) =>
  order.paymentStatus === 'pending' &&
  order.paymentMethod !== 'cod' &&
  (order.status === 'new' || order.status === 'confirmed')

/** A payment confirmation staff have not checked yet. */
export const paymentToVerify = (order: Order) =>
  order.paymentConfirmation?.status === 'submitted' && awaitsPayment(order)

export function paymentConfirmationBlocker(order: Order, input: PaymentConfirmationInput): string | null {
  if (order.paymentMethod === 'cod') return 'Cash on delivery is paid to the courier.'
  if (!awaitsPayment(order)) return 'This order is not waiting for payment.'
  if (order.paymentConfirmation?.status === 'submitted') return 'The store is already checking your payment.'
  if (!(input.amount > 0)) return 'Enter the amount you sent.'
  const channel = input.channel.trim()
  if (!channel || [...channel].length > 60) return 'Enter the bank or wallet you paid from.'
  const sender = input.senderName.trim()
  if (!sender || [...sender].length > 120) return 'Enter the name on the account you paid from.'
  if (!input.transferredAt.trim()) return 'Enter when you sent the money.'
  if (input.proofUrl && !input.proofUrl.includes('/med-')) return 'Upload the proof image here.'
  return null
}

/** Staff confirm or reject only a confirmation that waits for them, on an order still waiting for payment. */
export function paymentReviewBlocker(order: Order): string | null {
  if (order.paymentConfirmation?.status !== 'submitted') return 'No payment confirmation is waiting for a check.'
  if (!awaitsPayment(order)) return 'This order is not waiting for payment.'
  return null
}

export function cancelRefundBlocker(order: Order): string | null {
  if (!order.cancelRefund) return 'This order owes no refund.'
  if (order.cancelRefund.status === 'succeeded') return 'The refund is already recorded.'
  return null
}

/**
 * An unpaid order may still be paid within `window` ms of when it was placed, or of when staff
 * rejected its last payment confirmation. It stays open while staff check a confirmation.
 */
export function paymentWindowOpen(order: Order, now: number, window: number) {
  const pc = order.paymentConfirmation
  if (pc?.status === 'submitted') return true
  const since = Math.max(toMs(order.createdAt), pc?.reviewedAt ? toMs(pc.reviewedAt) : 0)
  return now - since < window
}

/**
 * An order with the shopper's personal details blanked for an erasure: the delivery city, and the
 * sender name and proof image of a payment confirmation. Amounts and dates stay (PP 80/2019 Pasal 25).
 */
export function eraseOrderDetails(order: Order): Order {
  const pc = order.paymentConfirmation
  if (!order.city && !pc?.senderName && !pc?.proofUrl) return order
  if (!pc) return { ...order, city: '' }
  const { proofUrl: _proof, ...kept } = pc
  return { ...order, city: '', paymentConfirmation: { ...kept, senderName: '' } }
}
