import type { Order } from '@rc/types'
import { FileText } from 'lucide-react'
import { useState } from 'react'
import { t } from '../i18n'
import { HTTP, api, shopperToken } from '../lib/api'
import { Button } from './ui'

/**
 * Downloads the invoice PDF of the signed-in shopper's own order. Needs the API and the shopper's
 * token; the first download issues the invoice number.
 */
export function InvoiceButton({ order, store }: { order: Order; store: string }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!HTTP || !shopperToken(order.tenantId).get()) return null
  const download = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const url = URL.createObjectURL(await api.shop.invoice(store, order.id))
      const link = document.createElement('a')
      link.href = url
      link.download = `invoice-${order.code}.pdf`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      setFailed(true)
    }
    setBusy(false)
  }
  return (
    <>
      <Button variant="outline" size="lg" disabled={busy} onClick={download}>
        <FileText className="size-4" aria-hidden="true" /> {t('account.order.invoice')}
      </Button>
      {failed && (
        <p role="alert" className="text-sm w-full text-center text-danger">
          {t('account.order.invoiceFailed')}
        </p>
      )}
    </>
  )
}
