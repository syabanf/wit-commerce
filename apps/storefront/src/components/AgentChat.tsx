import { fmtIdr, initials } from '@rc/fixtures'
import type { Customer, Order } from '@rc/types'
import { cn } from '@rc/ui'
import {
  Bot,
  Check,
  CircleAlert,
  LoaderCircle,
  Receipt,
  ScanSearch,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
  Tag,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { type AgentPlan, type Mandate } from '../lib/agent'
import { paths } from '../lib/paths'
import { type CartItem, type ChoiceItem, type Step, useAgentChat } from '../state/agentChat'
import { useShop } from '../state/shop'
import { ProductImage } from './product'
import { Button, ButtonLink, Pill } from './ui'

/**
 * The buying agent's conversation: greeting, the shopper's messages, the agent's work, its pick, the cart
 * mandate and the receipt. `compact` drops the padding for the store assistant's drawer.
 */
export function AgentThread({ compact }: { compact?: boolean }) {
  const { tenant, customer, customers, signIn, store } = useShop()
  const { items, examples, busy, protocol, say, pick, approve, decline } = useAgentChat()
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [items])
  const lastReplies = [...items].reverse().find((it) => it.kind === 'bot' && it.replies?.length)?.id
  const greeting = customer
    ? `Hi ${customer.name.split(' ')[0]}, I’m your shopping agent at ${tenant.name}. Tell me what you need and your budget. I’ll suggest options, you choose, and I pay only when you approve.`
    : `Hi, I’m a shopping agent for ${tenant.name} shoppers. Who am I buying for today?`

  return (
    <div ref={listRef} className={cn('space-y-4', !compact && 'p-4 md:p-6')} aria-live="polite">
      <BotRow>
        <Bubble>{greeting}</Bubble>
        {customer ? (
          !items.length && <Replies options={examples} onPick={say} disabled={busy} />
        ) : (
          <ShopperPicker
            options={customers.filter((c) => c.tenantId === tenant.id).slice(0, 3)}
            onPick={signIn}
          />
        )}
      </BotRow>
      {items.map((it) => {
        switch (it.kind) {
          case 'me':
            return (
              <div key={it.id} className="flex justify-end">
                <p className="px-4 py-2.5 text-sm leading-relaxed rounded-2xl rounded-br-md max-w-[85%] bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]">
                  <span className="sr-only">You: </span>
                  {it.text}
                </p>
              </div>
            )
          case 'bot':
            return (
              <BotRow key={it.id}>
                <Bubble>{it.text}</Bubble>
                {it.replies && it.id === lastReplies && (
                  <Replies options={it.replies} onPick={say} disabled={busy} />
                )}
              </BotRow>
            )
          case 'run':
            return (
              <BotRow key={it.id}>
                <RunCard plan={it.plan} shown={it.shown} tenantName={tenant.name} protocol={protocol} />
              </BotRow>
            )
          case 'choice':
            return (
              <BotRow key={it.id}>
                <ChoiceCard item={it} onPick={(optionId) => pick(it, optionId)} disabled={busy} />
              </BotRow>
            )
          case 'cart':
            return (
              <BotRow key={it.id}>
                <CartCard
                  item={it}
                  protocol={protocol}
                  onApprove={() => approve(it)}
                  onDecline={() => decline(it)}
                />
              </BotRow>
            )
          case 'receipt':
            return (
              <BotRow key={it.id}>
                <ReceiptCard order={it.order} plan={it.plan} store={store} protocol={protocol} />
              </BotRow>
            )
        }
      })}
    </div>
  )
}

/** The message box under the agent's thread. */
export function AgentComposer({ className }: { className?: string }) {
  const { customer } = useShop()
  const { busy, say } = useAgentChat()
  const [text, setText] = useState('')
  const inputId = useId()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim() || busy || !customer) return
    say(text)
    setText('')
  }
  return (
    <form onSubmit={submit} className={cn('gap-2 flex w-full', className)}>
      <label htmlFor={inputId} className="sr-only">
        Message your agent
      </label>
      <input
        id={inputId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!customer}
        placeholder={customer ? 'Tell me what to buy' : 'Pick who you are shopping for first'}
        autoComplete="off"
        className="h-12 min-w-0 px-4 text-base md:text-sm flex-1 rounded-[var(--sf-pill)] border border-[color:var(--sf-line)] bg-[var(--sf-bg)] disabled:opacity-60"
      />
      <Button
        type="submit"
        aria-label="Send"
        disabled={busy || !customer || !text.trim()}
        className="w-12 px-0"
      >
        <SendHorizontal aria-hidden="true" />
      </Button>
    </form>
  )
}

function BotRow({ children }: { children: ReactNode }) {
  return (
    <div className="gap-3 flex items-start">
      <span
        aria-hidden="true"
        className="size-8 md:size-9 flex shrink-0 items-center justify-center rounded-full bg-[var(--sf-text)] text-[color:var(--sf-bg)]"
      >
        <Bot className="size-4" />
      </span>
      <div className="min-w-0 space-y-2 flex-1">{children}</div>
    </div>
  )
}

function Bubble({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 py-2.5 text-sm leading-relaxed rounded-2xl rounded-tl-md w-fit max-w-[90%] bg-[var(--sf-soft)]">
      <span className="sr-only">Agent: </span>
      {children}
    </p>
  )
}

function Replies({
  options,
  onPick,
  disabled,
}: {
  options: string[]
  onPick: (t: string) => void
  disabled: boolean
}) {
  return (
    <div className="gap-2 flex flex-wrap">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          disabled={disabled}
          onClick={() => onPick(o)}
          className="min-h-10 px-3.5 py-2 text-xs font-semibold rounded-[var(--sf-pill)] border border-[color:var(--sf-line)] text-left hover:border-[color:var(--sf-text)] disabled:opacity-50"
        >
          {o}
        </button>
      ))}
    </div>
  )
}

interface RunLine {
  icon: LucideIcon
  text: ReactNode
  blocked?: boolean
}

/** One line per thing the agent did before it shows the pick. */
function runLines(plan: AgentPlan, store: string): RunLine[] {
  const lines: RunLine[] = [
    {
      icon: Bot,
      text: plan.constraints.length ? (
        <span className="gap-1 flex flex-wrap items-center">
          Understood:
          {plan.constraints.map((c) => (
            <Pill key={c} tone="soft">
              {c}
            </Pill>
          ))}
        </span>
      ) : (
        'Understood the request.'
      ),
    },
    {
      icon: ShieldCheck,
      text: plan.refusal ? `${store} turned me away.` : `${store} accepts shopping agents.`,
      blocked: !!plan.refusal,
    },
  ]
  if (plan.refusal) return lines
  lines.push({
    icon: ScanSearch,
    text: `Searched ${plan.scanned} products. ${plan.candidates.filter((c) => !c.rejected).length} fit your request.`,
  })
  return lines
}

function RunCard({
  plan,
  shown,
  tenantName,
  protocol,
}: {
  plan: AgentPlan
  shown: number
  tenantName: string
  protocol: boolean
}) {
  const lines = runLines(plan, tenantName)
  const visible = lines.slice(0, Math.min(lines.length, shown + 1))
  return (
    <div className="p-3 max-w-xl space-y-2 rounded-2xl rounded-tl-md border border-[color:var(--sf-line)]">
      {visible.map((line, i) => {
        const done = i < shown
        const Icon = line.icon
        return (
          <div key={i} className="gap-2.5 text-sm flex items-start">
            <span
              className={cn(
                'mt-0.5 size-5 flex shrink-0 items-center justify-center rounded-full',
                line.blocked && done
                  ? 'bg-[var(--sf-text)] text-[color:var(--sf-bg)]'
                  : done
                    ? 'bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]'
                    : 'bg-[var(--sf-soft)]',
              )}
            >
              {done ? (
                <Check className="size-3" aria-hidden="true" />
              ) : (
                <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              {done ? (
                line.text
              ) : (
                <span className="gap-1.5 inline-flex items-center text-[color:var(--sf-muted)]">
                  <Icon className="size-3.5" aria-hidden="true" /> Working…
                </span>
              )}
            </div>
          </div>
        )
      })}
      {protocol && shown > 0 && <MandateBlock mandate={plan.mandates.intent} />}
    </div>
  )
}

const BEST: Record<Step, string> = {
  product: 'Suggested',
  variant: 'Suggested',
  shipping: 'Suggested',
  offer: 'Best price',
}

/** One question with its options as numbered rows; the shopper taps one, types its number, or lets the agent pick. */
function ChoiceCard({
  item,
  onPick,
  disabled,
}: {
  item: ChoiceItem
  onPick: (optionId: string) => void
  disabled: boolean
}) {
  const open = !item.picked && !item.closed
  const shown = item.picked ? item.options.filter((o) => o.id === item.picked) : item.options
  const best = item.options.find((o) => o.best) ?? item.options[0]
  return (
    <div className="space-y-2">
      <Bubble>{item.question}</Bubble>
      <ol className="max-w-xl space-y-2 @container" aria-label={item.question}>
        {shown.map((o) => {
          const n = item.options.indexOf(o) + 1
          const picked = o.id === item.picked
          return (
            <li key={o.id}>
              <button
                type="button"
                disabled={!open || disabled}
                onClick={() => onPick(o.id)}
                className={cn(
                  'gap-3 p-3 rounded-2xl flex w-full items-center border text-left transition-colors',
                  picked
                    ? 'border-[color:var(--sf-primary)] bg-[var(--sf-bg)]'
                    : 'border-[color:var(--sf-line)] bg-[var(--sf-bg)] enabled:hover:border-[color:var(--sf-text)]',
                  item.closed && 'opacity-50',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-6 text-xs font-bold flex shrink-0 items-center justify-center rounded-full',
                    picked
                      ? 'bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]'
                      : 'bg-[var(--sf-soft)]',
                  )}
                >
                  {picked ? <Check className="size-3.5" /> : n}
                </span>
                {o.product ? (
                  <ProductImage
                    product={o.product}
                    size="sm"
                    className="size-12 shrink-0 rounded-[var(--sf-tile-radius)]"
                  />
                ) : (
                  <span className="size-10 flex shrink-0 items-center justify-center rounded-full bg-[var(--sf-soft)]">
                    {item.step === 'shipping' ? (
                      <Truck className="size-4" aria-hidden="true" />
                    ) : (
                      <Tag className="size-4" aria-hidden="true" />
                    )}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="gap-2 flex flex-wrap items-center">
                    <span className="text-sm font-semibold">{o.title}</span>
                    {o.best && <Pill tone="primary">{BEST[item.step]}</Pill>}
                  </span>
                  {o.detail && (
                    <span className="mt-0.5 text-xs block text-[color:var(--sf-muted)]">{o.detail}</span>
                  )}
                  <span className="mt-1 gap-2 @sm:hidden flex items-baseline">
                    <span className="sf-price text-sm font-bold">{o.amount}</span>
                    {o.note && <span className="text-[11px] text-[color:var(--sf-primary)]">{o.note}</span>}
                  </span>
                </span>
                <span className="@sm:block hidden shrink-0 text-right">
                  <span className="sf-price text-sm font-bold block">{o.amount}</span>
                  {o.note && (
                    <span className="block text-[11px] text-[color:var(--sf-primary)]">{o.note}</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {open && best && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onPick(best.id)}
          className="min-h-10 gap-1.5 px-3.5 text-xs font-semibold inline-flex items-center rounded-[var(--sf-pill)] border border-[color:var(--sf-line)] hover:border-[color:var(--sf-text)] disabled:opacity-50"
        >
          <Sparkles className="size-3.5" aria-hidden="true" /> Pick for me
        </button>
      )}
      {item.closed && (
        <p className="text-xs text-[color:var(--sf-muted)]">A newer request replaced this question.</p>
      )}
    </div>
  )
}

function CartCard({
  item,
  protocol,
  onApprove,
  onDecline,
}: {
  item: CartItem
  protocol: boolean
  onApprove: () => void
  onDecline: () => void
}) {
  const { plan, status } = item
  const best = plan.best!
  const rows: [string, number][] = [
    [`${plan.choice!.product.name}, ${plan.choice!.variant!.name}`, best.totals.subtotal],
    ...best.totals.discounts.map((d): [string, number] => [d.label, -d.amount]),
    ...(plan.negotiation.amount
      ? ([['Agent negotiation', -plan.negotiation.amount]] as [string, number][])
      : []),
    [`Shipping, ${plan.courier.label}`, plan.shipping],
  ]
  return (
    <div className="max-w-xl rounded-2xl @container overflow-hidden border border-[color:var(--sf-line)] bg-[var(--sf-bg)]">
      <div className="p-4">
        <p className="font-bold text-[11px] tracking-[0.16em] text-[color:var(--sf-muted)] uppercase">
          Cart mandate
        </p>
        <dl className="mt-2 text-sm">
          {rows.map(([label, amount]) => (
            <div key={label} className="gap-4 py-1 flex justify-between">
              <dt className="min-w-0 truncate text-[color:var(--sf-muted)]">{label}</dt>
              <dd className="sf-price shrink-0">{amount < 0 ? `-${fmtIdr(-amount)}` : fmtIdr(amount)}</dd>
            </div>
          ))}
          <div className="gap-4 pt-2 mt-1 font-bold flex justify-between border-t border-[color:var(--sf-line)]">
            <dt className="min-w-0">Total with {best.paymentType.name}</dt>
            <dd className="sf-price shrink-0">{fmtIdr(plan.total)}</dd>
          </div>
        </dl>
        {protocol && plan.mandates.cart && <MandateBlock mandate={plan.mandates.cart} />}
      </div>
      <div
        className={cn(
          'px-4 py-3 text-sm',
          status === 'paid'
            ? 'bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]'
            : 'bg-[var(--sf-soft)]',
          (status === 'declined' || status === 'replaced' || status === 'failed') &&
            'text-[color:var(--sf-muted)]',
        )}
      >
        {status === 'awaiting' && (
          <>
            <p className="gap-2 flex items-start">
              <CircleAlert
                className="mt-0.5 size-4 shrink-0 text-[color:var(--sf-primary)]"
                aria-hidden="true"
              />
              {plan.checkNote || 'Nothing is paid until you approve.'}
            </p>
            <div className="mt-3 gap-2 flex flex-wrap">
              <Button onClick={onApprove} className="@sm:w-auto w-full">
                <ShieldCheck aria-hidden="true" /> Approve and pay {fmtIdr(plan.total)}
              </Button>
              <Button variant="outline" onClick={onDecline} className="@sm:w-auto w-full">
                Not now
              </Button>
            </div>
          </>
        )}
        {status === 'paid' && (
          <p className="gap-2 font-semibold flex items-center">
            <Check className="size-4" aria-hidden="true" /> Paid {fmtIdr(plan.total)} with{' '}
            {best.paymentType.name}
          </p>
        )}
        {status === 'declined' && <p>You declined. Nothing was paid.</p>}
        {status === 'replaced' && <p>Replaced by a newer cart below. Nothing was paid.</p>}
        {status === 'failed' && <p>{item.note}</p>}
      </div>
    </div>
  )
}

function ReceiptCard({
  order,
  plan,
  store,
  protocol,
}: {
  order: Order
  plan: AgentPlan
  store: string
  protocol: boolean
}) {
  return (
    <div className="p-4 max-w-xl rounded-2xl bg-[var(--sf-text)] text-[color:var(--sf-bg)]">
      <p className="font-bold text-[11px] tracking-[0.16em] uppercase opacity-70">
        Order placed by your agent
      </p>
      <p className="mt-1 text-lg font-bold">
        {order.code} · {fmtIdr(order.total)}
      </p>
      <p className="mt-1 text-sm opacity-80">
        {plan.choice!.product.name}, {plan.choice!.variant!.name}. Ships with {plan.courier.label}.
      </p>
      {protocol && plan.mandates.payment && <MandateBlock mandate={plan.mandates.payment} inverse />}
      <ButtonLink to={paths.order(store, order.id)} variant="light" size="sm" className="mt-3">
        <Receipt aria-hidden="true" /> View order
      </ButtonLink>
    </div>
  )
}

function MandateBlock({ mandate, inverse }: { mandate: Mandate; inverse?: boolean }) {
  return (
    <pre
      className={cn(
        'mt-3 p-3 max-h-56 leading-relaxed overflow-auto rounded-[var(--sf-tile-radius)] text-[11px]',
        inverse
          ? 'bg-[var(--sf-bg)] text-[color:var(--sf-text)]'
          : 'bg-[var(--sf-text)] text-[color:var(--sf-bg)]',
      )}
    >
      {JSON.stringify({ type: mandate.type, id: mandate.id, ...mandate.payload }, null, 2)}
    </pre>
  )
}

function ShopperPicker({ options, onPick }: { options: Customer[]; onPick: (id: string) => void }) {
  return (
    <div className="gap-2 flex flex-wrap">
      {options.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onPick(c.id)}
          className="min-h-10 gap-2 pr-3 pl-1.5 text-xs font-semibold inline-flex items-center rounded-full border border-[color:var(--sf-line)] hover:border-[color:var(--sf-text)]"
        >
          <span className="size-7 font-bold flex items-center justify-center rounded-full bg-[var(--sf-soft)] text-[10px]">
            {initials(c.name)}
          </span>
          {c.name}
        </button>
      ))}
    </div>
  )
}
