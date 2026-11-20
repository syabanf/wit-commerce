import { fmtIdr } from '@rc/fixtures'
import type { Order } from '@rc/types'
import { Button, toast } from '@rc/ui'
import { FileText } from 'lucide-react'
import { useState } from 'react'
import { HTTP, api } from '../../lib/api'

function TaxRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="gap-2 flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{fmtIdr(value)}</dd>
    </div>
  )
}

/**
 * The PPN rows of a PKP brand's order. `placement` "before" goes above shipping when PPN was added
 * at checkout; "after" goes under the total when the prices already held it.
 */
export function OrderTaxRows({ order, placement }: { order: Order; placement: 'before' | 'after' }) {
  const tax = order.tax
  if (!tax || tax.pricesIncludeTax !== (placement === 'after')) return null
  return tax.pricesIncludeTax ? (
    <>
      <TaxRow label={`Includes PPN ${tax.ratePct}%`} value={tax.ppn} />
      <TaxRow label="Tax base (DPP)" value={tax.dpp} />
    </>
  ) : (
    <>
      <TaxRow label="Tax base (DPP)" value={tax.dpp} />
      <TaxRow label={`PPN ${tax.ratePct}%`} value={tax.ppn} />
    </>
  )
}

/** Downloads the order's invoice PDF. The first download issues its number. Needs the API. */
export function InvoiceButton({ order }: { order: Order }) {
  const [busy, setBusy] = useState(false)
  if (!HTTP) return null
  const download = async () => {
    setBusy(true)
    try {
      const blob = await api.orders.invoice(order.id, order.tenantId)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `invoice-${order.code}.pdf`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (err) {
      toast('No invoice', { tone: 'danger', description: (err as Error).message })
    }
    setBusy(false)
  }
  return (
    <Button variant="outline" loading={busy} onClick={download}>
      <FileText />
      Invoice
    </Button>
  )
}
