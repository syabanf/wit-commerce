import { fmtIdr, listOf } from '@rc/fixtures'
import { Button, cn, toast } from '@rc/ui'
import { Check } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { ActionSheet } from '../../components/ActionSheet'
import { useSellerScope } from '../../state/scope'

/** The featured section shows up to this many products. */
export const MAX_FEATURED = 4

export function FeaturedSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Featured products"
      description={`Pick up to ${MAX_FEATURED}. They show in this order on your store and in recommendations.`}
    >
      <FeaturedForm onDone={() => onOpenChange(false)} />
    </ActionSheet>
  )
}

function FeaturedForm({ onDone }: { onDone: () => void }) {
  const { seller, products, maps, dispatch } = useSellerScope()
  const [selected, setSelected] = useState(seller.featuredProductIds.filter((id) => maps.product.has(id)))
  const [tried, setTried] = useState(false)
  const full = selected.length >= MAX_FEATURED
  // Picked products first, in their order, then the rest of the catalogue.
  const rows = [
    ...selected.map((id) => maps.product.get(id)!),
    ...products.filter((p) => !selected.includes(p.id)),
  ]

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < MAX_FEATURED ? [...prev, id] : prev,
    )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!selected.length) return
    dispatch({ type: 'sellers/save', seller: { ...seller, featuredProductIds: selected } })
    toast('Featured products saved', {
      tone: 'success',
      description: listOf(selected.map((id) => maps.product.get(id)?.name ?? id)),
    })
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-xs font-medium text-muted tabular-nums" aria-live="polite">
        {selected.length} of {MAX_FEATURED} picked{full ? '. Remove one to add another.' : ''}
      </p>
      <ul className="-mx-1 space-y-1 px-1 no-scrollbar max-h-[45dvh] overflow-y-auto">
        {rows.map((p) => {
          const checked = selected.includes(p.id)
          const blocked = !checked && full
          return (
            <li key={p.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                disabled={blocked}
                onClick={() => toggle(p.id)}
                className={cn(
                  'min-h-14 gap-3 rounded-2xl px-3 py-2 flex w-full items-center text-left transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none active:scale-[0.99] disabled:opacity-50',
                  checked ? 'bg-surface' : 'hover:bg-surface',
                )}
              >
                <span
                  className={cn(
                    'size-6 rounded-lg flex shrink-0 items-center justify-center border-2',
                    checked ? 'border-ink bg-ink text-on-ink' : 'border-silver bg-card',
                  )}
                >
                  {checked && <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-semibold block truncate">{p.name}</span>
                  <span className="text-xs block truncate text-muted">
                    <span className="font-mono">{p.code}</span> ·{' '}
                    {p.assisted ? 'Talk to sales' : fmtIdr(p.price)}
                  </span>
                </span>
                {checked && (
                  <span className="text-xs font-bold shrink-0 text-muted tabular-nums">
                    #{selected.indexOf(p.id) + 1}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {tried && !selected.length && (
        <p className="text-xs text-danger">
          Pick at least one product. The featured section cannot stay empty.
        </p>
      )}
      <Button type="submit" size="lg" className="h-14 w-full">
        Save featured products
      </Button>
    </form>
  )
}
