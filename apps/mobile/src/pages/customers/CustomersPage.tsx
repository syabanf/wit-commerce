import { metricsFor } from '@rc/fixtures'
import type { Customer } from '@rc/types'
import { Button, Card, Chip, EmptyState, Input, LazySentinel, useLazyList } from '@rc/ui'
import { Search, Users } from 'lucide-react'
import { CustomerCard } from '../../components/CustomerCard'
import { ScreenHeader } from '../../layouts/ScreenHeader'
import { useReplaceParams } from '../../lib/url'
import { useNow, useSellerScope } from '../../state/scope'

type View = 'all' | 'repeat' | 'at-risk' | 'gold'

const VIEWS: { value: View; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'repeat', label: 'Repeat' },
  { value: 'at-risk', label: 'At risk' },
  { value: 'gold', label: 'Gold+' },
]

const isView = (value: string | null): value is View => VIEWS.some((v) => v.value === value)

export function CustomersPage() {
  const { customers, metrics, tenant } = useSellerScope()
  const now = useNow()
  const [params, update] = useReplaceParams()
  const raw = params.get('view')
  const view: View = isView(raw) ? raw : 'all'
  const query = params.get('q') ?? ''

  const matches: Record<View, (c: Customer) => boolean> = {
    all: () => true,
    repeat: (c) => metricsFor(metrics, c.id).orders >= 2,
    'at-risk': (c) => c.stage === 'at_risk' || c.stage === 'dormant',
    gold: (c) => c.tier === 'gold' || c.tier === 'platinum',
  }
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = customers.filter((c) => {
    const text = `${c.name} ${c.code} ${c.phone} ${c.city}`.toLowerCase()
    return words.every((w) => text.includes(w))
  })
  const items = searched.filter(matches[view])
  const lazy = useLazyList(items, { resetKey: [view, query] })

  const setParam = (key: string, value: string | null) =>
    update((p) => (value ? p.set(key, value) : p.delete(key)))

  return (
    <div className="space-y-5">
      <ScreenHeader context={`${customers.length} assigned to you · ${tenant.name}`} title="Customers" />

      <Input
        variant="pill"
        type="search"
        aria-label="Search customers"
        placeholder="Search by name, phone or city"
        leftIcon={<Search />}
        inputClassName="h-12"
        value={query}
        onChange={(e) => setParam('q', e.target.value)}
      />

      <div className="-mx-5 gap-2 px-5 pb-1 no-scrollbar flex overflow-x-auto">
        {VIEWS.map((v) => (
          <Chip
            key={v.value}
            variant="filter"
            className="h-11"
            active={view === v.value}
            count={searched.filter(matches[v.value]).length}
            onClick={() => setParam('view', v.value === 'all' || v.value === view ? null : v.value)}
          >
            {v.label}
          </Chip>
        ))}
      </div>

      {items.length ? (
        <div className="space-y-3">
          {lazy.visible.map((c) => (
            <CustomerCard key={c.id} customer={c} now={now} />
          ))}
          <LazySentinel remaining={lazy.remaining} onLoad={lazy.loadMore} sentinelRef={lazy.sentinelRef} />
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<Users />}
            title={customers.length ? 'No customers match' : 'No customers assigned yet'}
            description={
              customers.length
                ? 'Clear the search or pick another filter to see the rest of your customers.'
                : 'Shoppers who buy through your store or your ref link are assigned to you and show up here.'
            }
            action={
              customers.length ? (
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => update((p) => ['q', 'view'].forEach((k) => p.delete(k)))}
                >
                  Show all customers
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}
    </div>
  )
}
