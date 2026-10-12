import { fmtIdr, initials } from '@rc/fixtures'
import type { Customer, Order } from '@rc/types'
import { Code2, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { Link } from 'react-router'
import { AgentComposer, AgentThread } from '../components/AgentChat'
import { agentKindList } from '../lib/agent'
import { paths } from '../lib/paths'
import { useTitle } from '../lib/useTitle'
import { type Settings, useAgentChat } from '../state/agentChat'
import { useShop } from '../state/shop'

/** `/:store/agent`: the shopper chats with a buying agent that suggests, asks, and pays only once the shopper approves. */
export function AgentPage() {
  const { catalog, tenant, customer, store } = useShop()
  const { items, settings, setSettings, policy, protocol, setProtocol, orders } = useAgentChat()
  useTitle(`Shop with your agent · ${tenant.name}`)
  const panelRef = useRef<HTMLElement>(null)

  // Once the chat starts, the panel takes the whole screen below the store header.
  const started = items.length > 0
  useEffect(() => {
    if (started) panelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [started])

  return (
    <div className="space-y-5 md:pt-4">
      <header className="min-w-0">
        <p className="sf-kicker gap-1.5 flex items-center">
          <Sparkles className="size-3.5" aria-hidden="true" /> Agentic checkout
        </p>
        <h1 className="sf-title mt-2">Shop by chatting with your agent</h1>
        <p className="mt-1 max-w-2xl text-sm text-[color:var(--sf-muted)]">
          Tell it what you need. It searches {tenant.name}, suggests products, sizes, couriers and discounts,
          and lets you choose each one. Nothing is paid until you approve the cart. The {tenant.name}{' '}
          assistant on every page talks to the same agent.
        </p>
      </header>

      <div className="gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] grid grid-cols-1 items-start">
        <section
          ref={panelRef}
          aria-label="Chat with your agent"
          className="sf-card sf-chat flex min-h-[26rem] flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <AgentThread />
          </div>
          <AgentComposer className="p-3 md:p-4 border-t border-[color:var(--sf-line)]" />
        </section>
        <SidePanel
          customer={customer}
          store={store}
          settings={settings}
          onSettings={setSettings}
          policyNote={
            policy?.enabled
              ? `${tenant.name} accepts ${agentKindList(policy.kinds)}${policy.negotiation ? ` and grants agents up to ${policy.maxAutoDiscountPct}% off` : ''}. You approve every order before it is paid.`
              : `${tenant.name} does not accept buying agents right now.`
          }
          paymentTypes={catalog.paymentTypes.filter(
            (t) => t.enabled && (!policy?.paymentTypeIds.length || policy.paymentTypeIds.includes(t.id)),
          )}
          protocol={protocol}
          onProtocol={setProtocol}
          orders={orders}
        />
      </div>
    </div>
  )
}

function SidePanel({
  customer,
  store,
  settings,
  onSettings,
  policyNote,
  paymentTypes,
  protocol,
  onProtocol,
  orders,
}: {
  customer: Customer | null
  store: string
  settings: Settings
  onSettings: (s: Settings) => void
  policyNote: string
  paymentTypes: { id: string; name: string }[]
  protocol: boolean
  onProtocol: (on: boolean) => void
  orders: Order[]
}) {
  const uid = useId()
  const body = (
    <div className="space-y-5">
      {customer && (
        <div className="gap-3 flex items-center">
          <span
            aria-hidden="true"
            className="size-10 text-xs font-bold flex shrink-0 items-center justify-center rounded-full bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]"
          >
            {initials(customer.name)}
          </span>
          <p className="min-w-0 text-sm">
            <span className="font-semibold block truncate">Shopping for {customer.name}</span>
            <span className="text-xs text-[color:var(--sf-muted)]">Ships to {customer.city}</span>
          </p>
        </div>
      )}
      <div>
        <label htmlFor={`${uid}-pay`} className="mb-1.5 text-sm font-semibold block">
          Pay with
        </label>
        <select
          id={`${uid}-pay`}
          value={settings.paymentTypeId ?? ''}
          onChange={(e) => onSettings({ ...settings, paymentTypeId: e.target.value || null })}
          className="h-11 px-3 text-sm w-full rounded-[var(--sf-tile-radius)] border border-[color:var(--sf-line)] bg-[var(--sf-bg)]"
        >
          <option value="">Best price</option>
          {paymentTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <p className="gap-2 p-3 text-xs flex items-start rounded-[var(--sf-tile-radius)] bg-[var(--sf-soft)]">
        <ShieldCheck className="size-4 shrink-0 text-[color:var(--sf-primary)]" aria-hidden="true" />
        {policyNote}
      </p>
      <label className="gap-2 text-sm font-semibold flex cursor-pointer items-center">
        <input
          type="checkbox"
          checked={protocol}
          onChange={(e) => onProtocol(e.target.checked)}
          className="size-4 accent-[var(--sf-primary)]"
        />
        <Code2 className="size-4" aria-hidden="true" /> Show protocol messages
      </label>
      {orders.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">Bought by your agent</p>
          <ul className="space-y-2">
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  to={paths.order(store, o.id)}
                  className="gap-2 p-2.5 text-sm flex items-center justify-between rounded-[var(--sf-tile-radius)] bg-[var(--sf-soft)] hover:underline"
                >
                  <span className="text-xs font-mono">{o.code}</span>
                  <span className="sf-price font-semibold">{fmtIdr(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
  return (
    <aside
      aria-label="Your agent's mandate"
      className="sf-card p-5 lg:sticky lg:top-[var(--sf-sticky-top)] lg:order-none -order-1"
    >
      <details className="group lg:hidden">
        <summary className="min-h-11 gap-3 text-sm font-semibold flex cursor-pointer list-none items-center justify-between">
          Mandate and settings
          <span className="text-xs font-normal text-[color:var(--sf-muted)] group-open:hidden">
            Asks before it pays
          </span>
        </summary>
        <div className="pt-4">{body}</div>
      </details>
      <div className="lg:block hidden">
        <h2 className="mb-4 text-base font-bold">Your agent’s mandate</h2>
        {body}
      </div>
    </aside>
  )
}
