// Small drawings of the product made of styled divs, one per area on the product page. They are
// decoration, so each one is aria-hidden; the text beside it says what it shows.
import { cn } from '@rc/ui'
import type { ReactNode } from 'react'

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div aria-hidden className={cn('p-4 sm:p-6 rounded-hero bg-card shadow-card', className)}>
      {children}
    </div>
  )
}

const Bar = ({ className }: { className?: string }) => (
  <div className={cn('h-2 rounded-full bg-surface', className)} />
)

const Chip = ({ children, on }: { children: ReactNode; on?: boolean }) => (
  <span
    className={cn(
      'px-2.5 py-1 font-semibold rounded-full text-[11px] whitespace-nowrap',
      on ? 'text-white bg-ink' : 'bg-surface text-muted',
    )}
  >
    {children}
  </span>
)

/** The editor: sections on the left, the page with one section selected, Publish on top. */
export function EditorSketch() {
  return (
    <Frame>
      <div className="mb-3 flex items-center justify-between">
        <Chip>Draft</Chip>
        <span className="px-3 py-1 font-semibold text-white rounded-full bg-accent-strong text-[11px]">
          Publish
        </span>
      </div>
      <div className="gap-3 rounded-2xl p-3 grid grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)] bg-surface-2">
        <div className="space-y-2">
          {['Big banner', 'Product grid', 'Reviews', 'Questions'].map((s, i) => (
            <div
              key={s}
              className={cn(
                'rounded-xl px-2.5 py-2 font-semibold truncate text-[11px]',
                i === 0 ? 'text-white bg-ink' : 'bg-card text-muted',
              )}
            >
              {s}
            </div>
          ))}
        </div>
        <div className="space-y-2 rounded-xl p-2.5 bg-card">
          <div className="rounded-lg p-3 bg-accent-soft ring-2 ring-accent">
            <div className="h-2.5 w-2/3 rounded-full bg-accent/70" />
            <div className="mt-2 h-2 w-1/2 rounded-full bg-accent/30" />
            <div className="mt-3 h-5 w-16 rounded-full bg-accent-strong" />
          </div>
          <div className="gap-2 grid grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-lg aspect-square bg-surface" />
            ))}
          </div>
        </div>
      </div>
    </Frame>
  )
}

/** Checkout: the order lines, the payment choices and a currency estimate. */
export function CheckoutSketch() {
  return (
    <Frame>
      <p className="text-xs font-semibold text-muted uppercase">Checkout</p>
      <div className="mt-3 space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="gap-3 flex items-center">
            <div className="size-10 rounded-xl shrink-0 bg-surface" />
            <div className="space-y-1.5 flex-1">
              <Bar className="w-2/3 bg-chart-muted" />
              <Bar className="w-1/3" />
            </div>
            <Bar className="w-12 bg-chart-muted" />
          </div>
        ))}
      </div>
      <div className="mt-5 gap-1.5 flex flex-wrap">
        <Chip on>QRIS</Chip>
        <Chip>Virtual account</Chip>
        <Chip>GoPay</Chip>
        <Chip>Card</Chip>
        <Chip>Cash on delivery</Chip>
      </div>
      <div className="mt-5 rounded-2xl px-4 py-3 flex items-center justify-between bg-surface-2">
        <span className="text-xs font-semibold">Total in IDR</span>
        <span className="text-xs text-muted">≈ estimate in USD, SGD, EUR…</span>
      </div>
      <div className="mt-3 h-11 rounded-full bg-accent-strong" />
    </Frame>
  )
}

/** Operations: an order queue by status and stock split across warehouses. */
export function OperationsSketch() {
  const lanes = [
    { name: 'Paid', cards: 3 },
    { name: 'Packed', cards: 2 },
    { name: 'Shipped', cards: 1 },
  ]
  return (
    <Frame>
      <div className="gap-2 grid grid-cols-3">
        {lanes.map((l, li) => (
          <div key={l.name} className="rounded-2xl p-2 bg-surface-2">
            <p className="px-1 font-semibold text-[11px] text-muted">{l.name}</p>
            <div className="mt-2 space-y-1.5">
              {Array.from({ length: l.cards }, (_, i) => (
                <div
                  key={i}
                  className={cn('rounded-xl p-2 bg-card', li === 0 && i === 0 && 'ring-2 ring-accent')}
                >
                  <Bar className="w-3/4 bg-chart-muted" />
                  <Bar className="mt-1.5 w-1/2" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs font-semibold text-muted uppercase">Stock by warehouse</p>
      <div className="mt-2 space-y-2">
        {[
          { w: 'Main', width: 'w-4/5', on: true },
          { w: 'Store', width: 'w-2/5' },
          { w: 'Hub', width: 'w-1/4' },
        ].map((s) => (
          <div key={s.w} className="gap-3 flex items-center">
            <span className="w-12 font-semibold text-[11px] text-muted">{s.w}</span>
            <div className="h-3 flex-1 rounded-full bg-surface">
              <div className={cn('h-3 rounded-full', s.width, s.on ? 'bg-accent' : 'bg-chart-muted')} />
            </div>
          </div>
        ))}
      </div>
    </Frame>
  )
}

/** Customer 360: one person's record, segment chips and a timeline. */
export function CustomerSketch() {
  return (
    <Frame>
      <div className="gap-3 flex items-center">
        <div className="size-12 text-sm font-bold text-white grid place-items-center rounded-full bg-ink">
          AR
        </div>
        <div className="space-y-1.5 flex-1">
          <Bar className="w-1/2 bg-chart-muted" />
          <Bar className="w-1/3" />
        </div>
        <span className="px-2.5 py-1 font-semibold rounded-full bg-accent-soft text-[11px] text-accent">
          Gold
        </span>
      </div>
      <div className="mt-4 gap-1.5 flex flex-wrap">
        <Chip on>Runners</Chip>
        <Chip>Bought twice</Chip>
        <Chip>Bandung</Chip>
      </div>
      <ol className="mt-5 space-y-3 pl-4 border-l-2 border-surface">
        {['Order delivered', 'Campaign opened', 'Tier upgraded', 'Registered'].map((e, i) => (
          <li key={e} className="relative">
            <span
              className={cn(
                'top-1 size-2.5 absolute -left-[21px] rounded-full',
                i === 0 ? 'bg-accent' : 'bg-chart-muted',
              )}
            />
            <p className="text-xs font-semibold">{e}</p>
            <Bar className="mt-1 w-1/3" />
          </li>
        ))}
      </ol>
    </Frame>
  )
}

/** The seller phone app beside a personal store link. */
export function SellerSketch() {
  return (
    <Frame className="gap-4 sm:gap-6 flex items-center justify-center bg-surface-2 shadow-none">
      <div className="w-40 p-2 sm:w-44 shrink-0 rounded-[28px] bg-ink shadow-float">
        <div className="space-y-2 p-3 rounded-[22px] bg-surface">
          <div className="h-1.5 w-10 mx-auto rounded-full bg-chart-muted" />
          <p className="font-semibold text-[11px]">My orders</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl p-2 bg-card">
              <Bar className="w-3/4 bg-chart-muted" />
              <Bar className="mt-1.5 w-1/2" />
            </div>
          ))}
          <p className="pt-1 font-semibold text-[11px]">My leads</p>
          <div className="rounded-xl p-2 bg-card">
            <Bar className="w-2/3 bg-chart-muted" />
          </div>
        </div>
      </div>
      <div className="min-w-0 space-y-2">
        <div className="rounded-2xl p-3 bg-card shadow-card">
          <p className="font-semibold text-[11px] text-muted">Personal store</p>
          <div className="mt-2 gap-1.5 flex">
            {[0, 1].map((i) => (
              <div key={i} className="size-9 rounded-lg sm:size-11 bg-surface" />
            ))}
          </div>
        </div>
        <div className="px-3 py-2 font-semibold truncate rounded-full bg-card text-[11px] shadow-card">
          <span className="text-accent">●</span> referral link
        </div>
      </div>
    </Frame>
  )
}

/** The assistant: a question, an answer and an action waiting for Confirm, on the region's ink card. */
export function AssistantSketch() {
  return (
    <div
      aria-hidden
      className="p-5 text-white sm:p-6 relative overflow-hidden rounded-hero bg-ink shadow-float"
    >
      <div className="-top-20 -right-20 size-56 blur-3xl pointer-events-none absolute rounded-full bg-accent/40" />
      <div className="space-y-3 relative">
        <div className="rounded-2xl rounded-br-md bg-white/10 px-4 py-3 text-sm ml-auto w-fit max-w-[85%]">
          Which campaign brought the most orders?
        </div>
        <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm max-w-[90%] text-foreground">
          The payday email did. I can pause the one that brought none.
        </div>
        <div className="rounded-2xl bg-white p-4 max-w-[90%] text-foreground">
          <p className="text-xs font-semibold text-muted uppercase">Suggested action</p>
          <p className="mt-1 text-sm font-semibold">Pause campaign</p>
          <div className="mt-3 gap-2 flex">
            <span className="px-3 py-1.5 text-xs font-semibold text-white rounded-full bg-accent-strong">
              Confirm
            </span>
            <span className="px-3 py-1.5 text-xs font-semibold rounded-full bg-surface">Dismiss</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Platform: a live event feed, roles and a masked API key. */
export function PlatformSketch() {
  return (
    <Frame>
      <div className="gap-2 flex items-center">
        <span className="size-2 rounded-full bg-accent" />
        <p className="text-xs font-semibold">Live</p>
      </div>
      <ul className="mt-3 space-y-2">
        {['order.paid', 'inventory.updated', 'customer.created'].map((e, i) => (
          <li key={e} className="rounded-xl px-3 py-2 flex items-center justify-between bg-surface-2">
            <span className="text-xs font-semibold">{e}</span>
            <span className={cn('font-semibold text-[11px]', i === 0 ? 'text-accent' : 'text-muted')}>
              webhook sent
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-5 gap-1.5 flex flex-wrap">
        <Chip on>Owner</Chip>
        <Chip>Operations</Chip>
        <Chip>Marketing</Chip>
        <Chip>Service</Chip>
        <Chip>Sales</Chip>
      </div>
      <div className="mt-5 rounded-2xl px-4 py-3 flex items-center justify-between bg-surface-2">
        <span className="text-xs font-semibold">API key</span>
        <span className="text-xs tracking-widest text-muted">rck_••••••••</span>
      </div>
    </Frame>
  )
}
