import { fmtIdr, initials } from '@rc/fixtures'
import type { Customer, Order } from '@rc/types'
import { Code2, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { Link } from 'react-router'
import { AgentComposer, AgentThread } from '../components/AgentChat'
import { t } from '../i18n'
import { agentKindList } from '../lib/agent'
import { paths } from '../lib/paths'
import { useTitle } from '../lib/useTitle'
import { type Settings, useAgentChat } from '../state/agentChat'
import { useShop } from '../state/shop'

/** `/:store/agent`: the shopper chats with a buying agent that suggests, asks, and pays only once the shopper approves. */
export function AgentPage() {
  const { catalog, tenant, customer, store } = useShop()
  const { items, settings, setSettings, policy, protocol, setProtocol, orders } = useAgentChat()
  useTitle(t('agent.page.title', { store: tenant.name }))
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
          <Sparkles className="size-3.5" aria-hidden="true" /> {t('agent.page.kicker')}
        </p>
        <h1 className="sf-title mt-2">{t('agent.page.heading')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-[color:var(--sf-muted)]">
          {t('agent.page.intro', { store: tenant.name })}
        </p>
      </header>

      <div className="gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] grid grid-cols-1 items-start">
        <section
          ref={panelRef}
          aria-label={t('agent.page.chat')}
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
              ? t('agent.page.policy', {
                  store: tenant.name,
                  kinds: agentKindList(policy.kinds),
                  discount: policy.negotiation
                    ? t('agent.page.policyDiscount', { pct: policy.maxAutoDiscountPct })
                    : '',
                })
              : t('agent.page.policyOff', { store: tenant.name })
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
            <span className="font-semibold block truncate">
              {t('agent.page.shoppingFor', { name: customer.name })}
            </span>
            <span className="text-xs text-[color:var(--sf-muted)]">
              {t('agent.page.shipsTo', { city: customer.city })}
            </span>
          </p>
        </div>
      )}
      <div>
        <label htmlFor={`${uid}-pay`} className="mb-1.5 text-sm font-semibold block">
          {t('agent.page.payWith')}
        </label>
        <select
          id={`${uid}-pay`}
          value={settings.paymentTypeId ?? ''}
          onChange={(e) => onSettings({ ...settings, paymentTypeId: e.target.value || null })}
          className="h-11 px-3 text-base md:text-sm w-full rounded-[var(--sf-tile-radius)] border border-[color:var(--sf-line)] bg-[var(--sf-bg)]"
        >
          <option value="">{t('agent.page.bestPrice')}</option>
          {paymentTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <p className="gap-2 p-3 text-xs flex items-start rounded-[var(--sf-tile-radius)] bg-[var(--sf-soft)]">
        <ShieldCheck className="size-4 shrink-0 text-[color:var(--sf-primary-text)]" aria-hidden="true" />
        {policyNote}
      </p>
      <label className="gap-2 text-sm font-semibold flex cursor-pointer items-center">
        <input
          type="checkbox"
          checked={protocol}
          onChange={(e) => onProtocol(e.target.checked)}
          className="size-4 accent-[var(--sf-primary)]"
        />
        <Code2 className="size-4" aria-hidden="true" /> {t('agent.page.protocol')}
      </label>
      {orders.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">{t('agent.page.bought')}</p>
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
      aria-label={t('agent.page.mandate')}
      className="sf-card p-5 lg:sticky lg:top-[var(--sf-sticky-top)] lg:order-none -order-1"
    >
      <details className="group lg:hidden">
        <summary className="min-h-11 gap-3 text-sm font-semibold flex cursor-pointer list-none items-center justify-between">
          {t('agent.page.mandateSettings')}
          <span className="text-xs font-normal text-[color:var(--sf-muted)] group-open:hidden">
            {t('agent.page.asksFirst')}
          </span>
        </summary>
        <div className="pt-4">{body}</div>
      </details>
      <div className="lg:block hidden">
        <h2 className="mb-4 text-base font-bold">{t('agent.page.mandate')}</h2>
        {body}
      </div>
    </aside>
  )
}
