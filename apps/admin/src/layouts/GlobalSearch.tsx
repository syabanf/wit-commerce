import { LEAD_STAGE_LABEL, ORDER_STATUS_LABEL, PAGE_STATUS_LABEL, CAMPAIGN_STATUS_LABEL } from '@rc/types'
import { fmtIdr } from '@rc/fixtures'
import { Input, cn } from '@rc/ui'
import { Search } from 'lucide-react'
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '../components/links'
import { type Scoped, useScoped } from '../state/scoped'

interface Hit {
  id: string
  label: string
  hint: string
  to: string
}

const LIMIT = 5

function searchAll(s: Scoped, query: string): { group: string; hits: Hit[] }[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const match = (...fields: (string | null | undefined)[]) => {
    const text = fields.join(' ').toLowerCase()
    return terms.every((t) => text.includes(t))
  }
  const groups = [
    {
      group: 'Orders',
      hits: [...s.orders]
        .reverse()
        .filter((o) => match(o.code, s.customerName(o.customerId), o.trackingNo, o.voucherCode))
        .map((o) => ({
          id: o.id,
          label: `${o.code} · ${s.customerName(o.customerId)}`,
          hint: `${ORDER_STATUS_LABEL[o.status]} · ${fmtIdr(o.total)}`,
          to: paths.order(o.id),
        })),
    },
    {
      group: 'Customers',
      hits: s.customers
        .filter((c) => match(c.name, c.email, c.phone, c.code))
        .map((c) => ({
          id: c.id,
          label: `${c.name} · ${c.code}`,
          hint: `${c.email} · ${c.city}`,
          to: paths.customer(c.id),
        })),
    },
    {
      group: 'Products',
      hits: s.products
        .filter((p) => match(p.name, p.code, ...p.tags, ...p.variants.map((v) => v.sku)))
        .map((p) => ({
          id: p.id,
          label: `${p.code} · ${p.name}`,
          hint: s.categoryName(p.categoryId),
          to: paths.product(p.id),
        })),
    },
    {
      group: 'Leads',
      hits: s.leads
        .filter((l) => match(l.code, l.name, l.company))
        .map((l) => ({
          id: l.id,
          label: `${l.code} · ${l.company || l.name}`,
          hint: `${LEAD_STAGE_LABEL[l.stage]} · ${l.name}`,
          to: paths.lead(l.id),
        })),
    },
    {
      group: 'Campaigns',
      hits: s.campaigns
        .filter((c) => match(c.code, c.name))
        .map((c) => ({
          id: c.id,
          label: c.name,
          hint: CAMPAIGN_STATUS_LABEL[c.status],
          to: paths.campaign(c.id),
        })),
    },
    {
      group: 'Pages',
      hits: s.pages
        .filter((p) => match(p.title, p.slug))
        .map((p) => ({
          id: p.id,
          label: p.title,
          hint: `${p.slug} · ${PAGE_STATUS_LABEL[p.status]}`,
          to: paths.page(p.id),
        })),
    },
    {
      group: 'Sellers',
      hits: s.sellers
        .filter((x) => match(x.name, x.code, x.slug, x.city))
        .map((x) => ({
          id: x.id,
          label: `${x.name} · /${x.slug}`,
          hint: `${x.code} · ${x.city}`,
          to: paths.seller(x.id),
        })),
    },
  ]
  return groups.map((g) => ({ ...g, hits: g.hits.slice(0, LIMIT) })).filter((g) => g.hits.length)
}

export function GlobalSearch({
  className,
  autoFocus,
  onNavigate,
}: {
  className?: string
  autoFocus?: boolean
  onNavigate?: () => void
}) {
  const scoped = useScoped()
  const navigate = useNavigate()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const groups = useMemo(() => searchAll(scoped, query), [scoped, query])
  // Cmd/Ctrl+K focuses the search from anywhere. The phone row mounts with autoFocus instead.
  useEffect(() => {
    if (autoFocus) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [autoFocus])
  const flat = groups.flatMap((g) => g.hits)
  const showPanel = focused && query.trim().length > 0

  const go = (hit: Hit) => {
    navigate(hit.to)
    setQuery('')
    setFocused(false)
    onNavigate?.()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && flat[active]) {
      e.preventDefault()
      go(flat[active])
    } else if (e.key === 'Enter' && query.trim()) {
      e.preventDefault()
      go({ id: 'all', label: '', hint: '', to: `/commerce/orders?q=${encodeURIComponent(query.trim())}` })
    } else if (e.key === 'Escape') {
      setQuery('')
      e.currentTarget.blur()
    }
  }

  let index = -1
  return (
    <div className={cn('relative', className)}>
      <Input
        variant="pill"
        type="search"
        leftIcon={<Search />}
        ref={inputRef}
        placeholder="Search orders, customers, products"
        rightSlot={
          !autoFocus ? (
            <kbd className="rounded-md px-1.5 py-0.5 font-semibold sm:inline hidden border border-border bg-surface text-[0.625rem] text-muted">
              ⌘K
            </kbd>
          ) : undefined
        }
        value={query}
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showPanel && flat[active] ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 150)}
        onKeyDown={onKeyDown}
      />
      {showPanel && (
        <div
          id={listId}
          role="listbox"
          className="inset-x-0 mt-2 rounded-2xl p-1 absolute top-full z-40 max-h-[60dvh] overflow-y-auto border border-border bg-card shadow-float"
        >
          {groups.length === 0 ? (
            <p className="px-3 py-6 text-sm text-center text-muted">No matches for "{query.trim()}"</p>
          ) : (
            groups.map((g) => (
              <div key={g.group} className="py-1">
                <p className="px-3 pb-1 pt-2 font-semibold tracking-wider text-[0.6875rem] text-muted uppercase">
                  {g.group}
                </p>
                {g.hits.map((hit) => {
                  index++
                  const i = index
                  return (
                    <button
                      key={hit.id}
                      id={`${listId}-${i}`}
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(hit)}
                      className="rounded-xl px-3 py-2 flex w-full flex-col items-start text-left hover:bg-surface aria-selected:bg-surface"
                    >
                      <span className="text-sm font-medium w-full truncate">{hit.label}</span>
                      {hit.hint && <span className="text-xs w-full truncate text-muted">{hit.hint}</span>}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
