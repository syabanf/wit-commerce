import type { Customer } from '@rc/types'
import { Button, FormField, Textarea, toast } from '@rc/ui'
import { MessageCircle } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { ActionSheet } from '../../components/ActionSheet'
import { ProductPicker } from '../../components/ProductPicker'
import { firstName, waLink } from '../../lib/seller'
import { useSellerScope } from '../../state/scope'

interface SheetProps {
  customer: Customer
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RecommendSheet({ customer, open, onOpenChange }: SheetProps) {
  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Recommend a product"
      description={`WhatsApp opens with a message to ${firstName(customer.name)} and your store link, so the order counts as yours.`}
    >
      <RecommendForm customer={customer} onDone={() => onOpenChange(false)} />
    </ActionSheet>
  )
}

function RecommendForm({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const { products, seller, storeHref, maps, dispatch } = useSellerScope()
  const [productId, setProductId] = useState<string | null>(seller.featuredProductIds[0] ?? null)
  const [tried, setTried] = useState(false)
  const product = productId ? maps.product.get(productId) : undefined
  const message = product
    ? `Hi ${firstName(customer.name)}, ${product.name} could suit you. ${product.bestFor ? `It is made for ${product.bestFor.toLowerCase()}. ` : ''}Have a look in my store: ${storeHref}?ref=${seller.slug}`
    : ''

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!product) return
    window.open(waLink(customer.phone, message), '_blank', 'noopener')
    dispatch({ type: 'customers/note', id: customer.id, note: `Recommended ${product.name} on WhatsApp` })
    toast('Recommendation logged', {
      tone: 'success',
      description: `${product.name} for ${customer.name}. Send it from WhatsApp.`,
    })
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FormField
        label="Product"
        required
        error={tried && !product ? 'Choose the product to recommend.' : undefined}
      >
        <ProductPicker products={products} value={productId} onChange={setProductId} />
      </FormField>
      {product && (
        <div className="rounded-2xl p-4 bg-surface">
          <p className="font-semibold tracking-wider text-[11px] text-muted uppercase">Message</p>
          <p className="mt-1 text-sm break-words text-body">{message}</p>
        </div>
      )}
      <Button type="submit" size="lg" className="h-14 w-full">
        <MessageCircle />
        Open WhatsApp
      </Button>
    </form>
  )
}

export function NoteSheet({ customer, open, onOpenChange }: SheetProps) {
  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add a note"
      description={`Notes stay on ${firstName(customer.name)}'s timeline for you and the brand team.`}
    >
      <NoteForm customer={customer} onDone={() => onOpenChange(false)} />
    </ActionSheet>
  )
}

function NoteForm({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const { dispatch } = useSellerScope()
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!note.trim()) return
    dispatch({ type: 'customers/note', id: customer.id, note: note.trim() })
    toast('Note added', { tone: 'success', description: customer.name })
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FormField
        label="Note"
        required
        error={tried && !note.trim() ? 'Write the note before saving.' : undefined}
      >
        <Textarea
          variant="soft"
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Size 42, prefers neutral colours, payday on the 25th"
        />
      </FormField>
      <Button type="submit" size="lg" className="h-14 w-full">
        Save note
      </Button>
    </form>
  )
}
