import type { OrderPayment } from '@rc/api'
import { useEffect, useState } from 'react'
import { HTTP, api } from '../lib/api'

/**
 * The order's online payment record, read again when the order's payment status changes. Null
 * without the API, and for an order no provider took a payment for.
 */
export function useOrderPayment(
  id: string | undefined,
  tenantId: string,
  paymentStatus: string | undefined,
): OrderPayment | null {
  const [payment, setPayment] = useState<OrderPayment | null>(null)
  useEffect(() => {
    if (!HTTP || !id) return
    let cancelled = false
    api.orders
      .payment(id, tenantId)
      .then((answer) => !cancelled && setPayment(answer.payment))
      .catch(() => !cancelled && setPayment(null))
    return () => {
      cancelled = true
    }
  }, [id, tenantId, paymentStatus])
  return payment && payment.orderId === id ? payment : null
}
