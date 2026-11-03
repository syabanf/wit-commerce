import { type Permission, fmtIdr } from '@rc/fixtures'
import { CAMPAIGN_STATUS_LABEL, LEAD_STAGE_LABEL, ORDER_STATUS_LABEL } from '@rc/types'
import { Dialog, DialogContent, DialogTitle, cn, matchesQuery } from '@rc/ui'
import {
  CheckCheck,
  CircleUser,
  Gem,
  Handshake,
  History,
  Megaphone,
  Package,
  Plus,
  Search,
  ShoppingBag,
} from 'lucide-react'
import { type KeyboardEvent, type ReactElement, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/auth'
import { paths } from '../components/links'
import { usePersistentState } from '../lib/storage'
import { type Scoped, useScoped } from '../state/scoped'
import { useCreateActions } from './CreateMenu'
import { type BadgeKey, NAV } from './nav'
import { useNavCounts } from './useNavCounts'

interface Row {
  key: string
  label: string
  hint?: string
  code?: string
  icon: ReactElement
  to: string
  /** Words a search matches beyond the label, hint and code. */
  terms?: string
}

interface Group {
  title: string
  rows: Row[]
}

const RECORD_LIMIT = 5
const RECENT_SHOWN = 3
// Paths of removed records and other tenants stay stored and resolve to nothing, so keep some spare.
const RECENT_STORED = 12

/** Work waiting for this user. Each row hides at zero and for roles that cannot do it. */
const TASKS: { label: string; code: string; to: string; badge: BadgeKey; permission: Permission }[] = [
  {
    label: 'Fulfil orders',
    code: 'ORD',
    to: '/commerce/orders?view=to-fulfil',
    badge: 'toFulfil',
    permission: 'order.fulfil',
  },
  {
    label: 'Answer support tickets',
    code: 'SUP',
    to: '/customers/support',
    badge: 'openTickets',
    permission: 'ticket.manage',
  },
  {
    label: 'Follow up new leads',
    code: 'LED',
    to: '/customers/leads',
    badge: 'newLeads',
    permission: 'lead.manage',
  },
  {
    label: 'Restock low items',
    code: 'INV',
    to: '/commerce/inventory?view=low',
    badge: 'lowStock',
    permission: 'inventory.manage',
  },
]

const PAGE_ROWS: Row[] = NAV.flatMap((section) => {
  const pages = section.items ?? (section.code ? [{ ...section, code: section.code }] : [])
  return pages.map((page) => {
    const Icon = page.icon
    return {
      key: `page-${page.to}`,
      label: page.label,
      hint: section.items ? section.label : undefined,
      code: page.code,
      icon: <Icon />,
      to: page.to,
    }
  })
})

function recordGroups(s: Scoped): Group[] {
  return [
    {
      title: 'Orders',
      rows: [...s.orders].reverse().map((o) => ({
        key: o.id,
        label: s.customerName(o.customerId),
        hint: `${ORDER_STATUS_LABEL[o.status]} · ${fmtIdr(o.total)}`,
        code: o.code,
        icon: <ShoppingBag />,
        to: paths.order(o.id),
        terms: [o.trackingNo, o.voucherCode].filter(Boolean).join(' '),
      })),
    },
    {
      title: 'Customers',
      rows: s.customers.map((c) => ({
        key: c.id,
        label: c.name,
        hint: `${c.email} · ${c.city}`,
        code: c.code,
        icon: <CircleUser />,
        to: paths.customer(c.id),
        terms: c.phone,
      })),
    },
    {
      title: 'Products',
      rows: s.products.map((p) => ({
        key: p.id,
        label: p.name,
        hint: s.categoryName(p.categoryId),
        code: p.code,
        icon: <Package />,
        to: paths.product(p.id),
        terms: [...p.tags, ...p.variants.map((v) => v.sku)].join(' '),
      })),
    },
    {
      title: 'Leads',
      rows: s.leads.map((l) => ({
        key: l.id,
        label: l.company || l.name,
        hint: `${LEAD_STAGE_LABEL[l.stage]} · ${l.name}`,
        code: l.code,
        icon: <Handshake />,
        to: paths.lead(l.id),
      })),
    },
    {
      title: 'Campaigns',
      rows: s.campaigns.map((c) => ({
        key: c.id,
        label: c.name,
        hint: CAMPAIGN_STATUS_LABEL[c.status],
        code: c.code,
        icon: <Megaphone />,
        to: paths.campaign(c.id),
      })),
    },
    {
      title: 'Sellers',
      rows: s.sellers.map((x) => ({
        key: x.id,
        label: x.name,
        hint: `/${x.slug} · ${x.city}`,
        code: x.code,
        icon: <Gem />,
        to: paths.seller(x.id),
      })),
    },
  ]
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/** Opens with Cmd/Ctrl+K or / from any page, and remembers the records this user opens. */
export function QuickSearch({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { pathname } = useLocation()
  const [recent, setRecent] = usePersistentState<string[]>('rc.admin.recent', [])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const combo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)
      if (!combo && !slash) return
      e.preventDefault()
      onOpenChange(combo ? !open : true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  useEffect(() => {
    if (PAGE_ROWS.some((row) => row.to === pathname)) return
    setRecent((paths) => [pathname, ...paths.filter((p) => p !== pathname)].slice(0, RECENT_STORED))
  }, [pathname, setRecent])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        aria-describedby={undefined}
        className="p-0 -translate-y-0 top-[10dvh] flex max-h-[80dvh] flex-col overflow-hidden"
      >
        <DialogTitle className="sr-only">Quick search</DialogTitle>
        <Palette recent={recent} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function Palette({ recent, onClose }: { recent: string[]; onClose: () => void }) {
  const scoped = useScoped()
  const counts = useNavCounts()
  const creates = useCreateActions()
  const { can } = useAuth()
  const navigate = useNavigate()
  const listId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const records = useMemo(() => recordGroups(scoped), [scoped])

  const groups = useMemo(() => {
    const q = query.trim()
    const tasks: Row[] = TASKS.filter((t) => counts[t.badge] > 0 && can(t.permission)).map((t) => ({
      key: `task-${t.label}`,
      label: `${t.label} (${counts[t.badge]})`,
      code: t.code,
      icon: <CheckCheck />,
      to: t.to,
    }))
    const createRows: Row[] = creates.map((c) => ({
      key: `create-${c.key}`,
      label: `New ${c.label.toLowerCase()}`,
      code: c.code,
      icon: <Plus />,
      to: c.to,
      terms: `create add buat tambah ${c.description}`,
    }))
    const hits = (rows: Row[]) => rows.filter((r) => matchesQuery(q, r.label, r.hint, r.code, r.terms))
    if (!q) {
      const byPath = new Map(records.flatMap((g) => g.rows).map((r) => [r.to, r]))
      const opened = recent.flatMap((to) => byPath.get(to) ?? []).slice(0, RECENT_SHOWN)
      return [
        { title: 'Tasks', rows: tasks },
        { title: 'Create', rows: createRows },
        { title: 'Recently opened', rows: opened.map((r) => ({ ...r, icon: <History /> })) },
        { title: 'Pages', rows: PAGE_ROWS },
      ].filter((g) => g.rows.length)
    }
    const found: Group[] = [
      { title: 'Tasks', rows: hits(tasks) },
      { title: 'Create', rows: hits(createRows) },
      { title: 'Pages', rows: hits(PAGE_ROWS) },
      ...records.map((g) => ({ title: g.title, rows: hits(g.rows).slice(0, RECORD_LIMIT) })),
    ]
    // A typed code goes first, so the code and Enter open it.
    const exact = found.flatMap((g) => g.rows).find((r) => r.code?.toLowerCase() === q.toLowerCase())
    const rest = exact
      ? found.map((g) => ({ ...g, rows: g.rows.filter((r) => r.code !== exact.code) }))
      : found
    return [...(exact ? [{ title: 'Code', rows: [exact] }] : []), ...rest].filter((g) => g.rows.length)
  }, [query, records, recent, counts, creates, can])

  const flat = groups.flatMap((g) => g.rows)

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const go = (row: Row) => {
    navigate(row.to)
    onClose()
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
    }
  }

  let index = -1
  return (
    <>
      <div className="gap-3 px-4 h-14 flex shrink-0 items-center border-b border-border">
        <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          placeholder='What do you want to do? Try "new product" or ORD'
          aria-label="Quick search"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={flat[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          className="min-w-0 text-base md:text-sm flex-1 bg-transparent outline-none placeholder:text-muted"
        />
        <kbd className="rounded-md px-1.5 py-0.5 font-semibold md:inline hidden border border-border bg-surface text-[0.625rem] text-muted">
          Esc
        </kbd>
      </div>
      <div ref={listRef} id={listId} role="listbox" className="min-h-0 p-2 flex-1 overflow-y-auto">
        {flat.length === 0 && (
          <p className="px-3 py-8 text-sm text-center text-muted">No matches for "{query.trim()}"</p>
        )}
        {groups.map((g) => (
          <div key={g.title} role="group" aria-label={g.title} className="pb-1">
            <p className="px-3 pb-1 pt-2 font-semibold tracking-wider text-[0.6875rem] text-muted uppercase">
              {g.title}
            </p>
            {g.rows.map((row) => {
              index += 1
              const i = index
              return (
                <button
                  key={row.key}
                  id={`${listId}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  tabIndex={-1}
                  onClick={() => go(row)}
                  onMouseMove={() => setActive(i)}
                  className={cn(
                    'gap-3 rounded-xl px-3 py-2 text-sm min-h-10 [&_svg]:size-4 flex w-full items-center text-left [&_svg]:shrink-0 [&_svg]:text-muted',
                    i === active && 'bg-surface',
                  )}
                >
                  {row.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{row.label}</span>
                    {row.hint && <span className="text-xs block truncate text-muted">{row.hint}</span>}
                  </span>
                  {row.code && (
                    <span className="shrink-0 font-mono text-[0.6875rem] text-muted">{row.code}</span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <p className="px-4 py-2 md:block hidden shrink-0 border-t border-border text-[0.6875rem] text-muted">
        ↑↓ select · Enter open · ⌘K or / from any page
      </p>
    </>
  )
}
