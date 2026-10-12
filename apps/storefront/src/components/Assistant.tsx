import { fmtIdr } from '@rc/fixtures'
import type { Product } from '@rc/types'
import { cn } from '@rc/ui'
import { Bot, SendHorizontal, Sparkles } from 'lucide-react'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import {
  type Intent,
  type QuickReply,
  type ReplyAction,
  applyReply,
  describeIntent,
  followUps,
  hasCriteria,
  openingReplies,
  recommend,
} from '../lib/assistant'
import { fromPrice, popularCategories, productsIn, quickAddable } from '../lib/catalog'
import { favouriteOf } from '../lib/checkout'
import { paths } from '../lib/paths'
import { usePersisted } from '../lib/storage'
import { useAgentChat } from '../state/agentChat'
import { useShop } from '../state/shop'
import { AgentComposer, AgentThread } from './AgentChat'
import { Drawer } from './Drawer'
import { CategoryIcon, ProductImage, useQuickAdd } from './product'
import { Button, Scroller } from './ui'

interface Message {
  id: number
  from: 'bot' | 'me'
  text: string
  chips?: string[]
  productIds?: string[]
  replies?: QuickReply[]
  /** Show the category carousel under the greeting. */
  categories?: boolean
}

interface Conversation {
  messages: Message[]
  intent: Intent | null
  lastPicks: string[]
}

const EMPTY: Conversation = { messages: [], intent: null, lastPicks: [] }

type Mode = 'ask' | 'agent'

/** "Belikan…", "buy me…": the shopper wants it bought, so the buying agent takes the message. */
const BUY = /^(belikan|beliin|tolong beli(kan)?|pesankan|buy me|buy|order me|get me)\b/i

/**
 * Shopping assistant (spec 20 intent search, spec 43): a floating "Ask <store>" button and a chat panel
 * that reads the request with `understand` and answers with `recommend`. Everything runs on this
 * store's catalog in the browser; the conversation lasts for the tab session.
 */
export function Assistant({ look, hidden }: { look: 'rounded' | 'hairline'; hidden?: boolean }) {
  const shop = useShop()
  const { tenant, catalog, customer, store } = shop
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [convo, setConvo] = usePersisted<Conversation>(
    'session',
    `rc.storefront.assistant.${tenant.id}`,
    EMPTY,
  )
  const listRef = useRef<HTMLDivElement>(null)
  const inputId = useId()
  const quickAdd = useQuickAdd()
  const agent = useAgentChat()
  // A link inside the drawer (View order, a product) closes it.
  const { pathname } = useLocation()
  useEffect(() => {
    setOpen(false)
  }, [pathname])
  const [mode, setMode] = usePersisted<Mode>('session', `rc.storefront.assistant-mode.${tenant.id}`, 'ask')
  const waiting = agent.items.some((it) => it.kind === 'cart' && it.status === 'awaiting')
  /** Hands a request to the buying agent in this drawer. */
  const buy = (task: string) => {
    setMode('agent')
    agent.say(task)
  }

  const greeting = (id: number): Message => ({
    id,
    from: 'bot',
    text: `Hi, I'm the ${tenant.name} assistant. Tell me what you need, or pick one below.`,
    replies: openingReplies(catalog),
    categories: true,
  })
  // The greeting is not stored, so it always reflects the live catalog.
  const stored = Array.isArray(convo?.messages) ? convo.messages : []
  const messages = stored.length ? stored : [greeting(1)]

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [messages.length, open])

  const answer = (intent: Intent | null, startId: number): { replies: Message[]; picks: string[] } => {
    if (!intent) return { replies: [greeting(startId)], picks: [] }
    const rec = recommend(intent, catalog, favouriteOf(customer))
    const chips = describeIntent(intent, catalog)
    if (!hasCriteria(intent) && !rec.picks.length)
      return {
        replies: [
          {
            id: startId,
            from: 'bot',
            text: 'I could not tell what you are looking for. Name a product type and a budget, such as "serum under 300rb" or "running shoes max 1,5 juta".',
            replies: openingReplies(catalog),
          },
        ],
        picks: [],
      }
    if (rec.picks.length)
      return {
        replies: [
          {
            id: startId,
            from: 'bot',
            text:
              rec.picks.length === 1
                ? 'Here is the best match in stock.'
                : `Here are ${rec.picks.length} picks in stock.`,
            chips,
            productIds: rec.picks.map((p) => p.id),
          },
          {
            id: startId + 1,
            from: 'bot',
            text: 'Want me to narrow it down?',
            replies: followUps(intent, rec, catalog),
          },
        ],
        picks: rec.picks.map((p) => p.id),
      }
    const closest = rec.closestCategory
    return {
      replies: [
        {
          id: startId,
          from: 'bot',
          text: `Nothing in stock matches all of that.${closest ? ` The closest is ${closest.name}` : ''}${
            rec.cheapest
              ? `, where the cheapest pick is ${rec.cheapest.name} at ${fmtIdr(fromPrice(rec.cheapest))}.`
              : '.'
          }`,
          chips,
          productIds: rec.cheapest ? [rec.cheapest.id] : [],
          replies: [
            ...(closest
              ? [
                  {
                    label: `Show all ${closest.name.toLowerCase()}`,
                    action: { kind: 'category', categoryId: closest.id } as ReplyAction,
                  },
                ]
              : []),
            { label: 'Something else', action: { kind: 'reset' } },
          ],
        },
      ],
      picks: rec.cheapest ? [rec.cheapest.id] : [],
    }
  }

  const ask = (label: string, action: ReplyAction) => {
    const base = Math.max(0, ...messages.map((m) => m.id)) + 1
    const lastPicks = convo.lastPicks.map((id) => catalog.productMap.get(id)).filter((p): p is Product => !!p)
    const intent = applyReply(convo.intent, action, catalog, lastPicks)
    const { replies, picks } = answer(intent, base + 1)
    setConvo({
      messages: [...messages, { id: base, from: 'me' as const, text: label }, ...replies].slice(-40),
      intent,
      lastPicks: picks,
    })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const value = text.trim()
    if (!value) return
    setText('')
    if (BUY.test(value) && customer && !agent.busy) return buy(value)
    ask(value, { kind: 'text', text: value })
  }

  const hairline = look === 'hairline'
  const bubble = (from: Message['from']) =>
    cn(
      'max-w-[85%] px-4 py-2.5 text-sm leading-relaxed',
      from === 'me'
        ? hairline
          ? 'ml-auto rounded-[2px] bg-[var(--sf-text)] text-[color:var(--sf-bg)] md:rounded-2xl'
          : 'ml-auto rounded-2xl rounded-br-md bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]'
        : hairline
          ? 'rounded-[2px] border border-[color:var(--sf-line)] md:rounded-2xl md:border-0 md:bg-[var(--sf-soft)]'
          : 'rounded-2xl rounded-bl-md bg-[var(--sf-soft)]',
    )
  const pill = cn(
    'inline-flex min-h-11 shrink-0 items-center px-4 text-sm font-semibold transition hover:bg-[var(--sf-text)] hover:text-[color:var(--sf-bg)]',
    'rounded-[var(--sf-pill)] border border-[color:var(--sf-line)]',
  )
  const lastReplyId = [...messages].reverse().find((m) => m.replies?.length)?.id
  /** The shopper's words that led to a bot message, handed to the buying agent as its task. */
  const askedFor = (id: number) => [...messages].reverse().find((m) => m.id < id && m.from === 'me')?.text

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'right-4 bottom-24 size-11 md:right-6 md:bottom-6 md:size-14 fixed z-40 inline-flex items-center justify-center bg-[var(--sf-text)] text-[color:var(--sf-bg)] shadow-float transition-transform hover:scale-105',
          hairline ? 'rounded-[var(--sf-pill)]' : 'rounded-full',
          hidden && 'hidden',
        )}
        aria-haspopup="dialog"
        title={`Ask ${tenant.name}`}
      >
        <Bot className="size-5 md:size-6" aria-hidden="true" />
        <span className="sr-only">Ask {tenant.name}</span>
        {waiting && (
          <span className="-top-0.5 -right-0.5 size-3.5 absolute rounded-full border-2 border-[var(--sf-bg)] bg-[var(--sf-primary)]">
            <span className="sr-only">, your agent is waiting for your approval</span>
          </span>
        )}
      </button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={mode === 'agent' ? 'Your shopping agent' : `Ask ${tenant.name}`}
        description={
          mode === 'agent' ? (
            <>
              {agent.settings.limit
                ? `Pays on its own up to ${fmtIdr(agent.settings.limit)}. `
                : 'Asks you before it pays. '}
              <Link to={paths.agent(store)} className="font-semibold underline underline-offset-4">
                Limits and payment
              </Link>
            </>
          ) : (
            "Answers come from this store's catalog."
          )
        }
        bodyClassName="pb-2"
        footer={
          mode === 'agent' ? (
            <AgentComposer />
          ) : (
            <form onSubmit={submit} className="gap-2 flex w-full">
              <label htmlFor={inputId} className="sr-only">
                Message the assistant
              </label>
              <input
                id={inputId}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Sepatu lari untuk 10K, maksimal 1,5 juta"
                autoComplete="off"
                className="h-12 min-w-0 px-4 text-sm flex-1 rounded-[var(--sf-pill)] border border-[color:var(--sf-line)] bg-[var(--sf-bg)]"
              />
              <Button
                type="submit"
                variant={hairline ? 'dark' : 'primary'}
                aria-label="Send"
                className="w-12 px-0"
              >
                <SendHorizontal aria-hidden="true" />
              </Button>
            </form>
          )
        }
      >
        <ModeSwitch mode={mode} onMode={setMode} waiting={waiting} />
        {mode === 'agent' ? (
          <AgentThread compact />
        ) : (
          <div ref={listRef} className="space-y-3" aria-live="polite">
            {messages.map((m) => (
              <div key={m.id} className="space-y-2">
                <p className={bubble(m.from)}>
                  <span className="sr-only">{m.from === 'me' ? 'You: ' : 'Assistant: '}</span>
                  {m.text}
                </p>
                {m.chips && m.chips.length > 0 && (
                  <ul className="gap-1.5 flex flex-wrap" aria-label="What I understood">
                    {m.chips.map((c) => (
                      <li
                        key={c}
                        className="px-2.5 py-1 text-xs font-semibold rounded-full bg-[var(--sf-soft)]"
                      >
                        {c}
                      </li>
                    ))}
                  </ul>
                )}
                {m.categories && (
                  <Scroller label="Categories">
                    {popularCategories(catalog)
                      .slice(0, 6)
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => ask(c.name, { kind: 'category', categoryId: c.id })}
                          className="w-32 gap-3 p-3 flex shrink-0 snap-start flex-col items-start rounded-[var(--sf-tile-radius)] border border-[color:var(--sf-line)] text-left hover:border-[color:var(--sf-text)]"
                        >
                          <span className="size-9 flex items-center justify-center rounded-full bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]">
                            <CategoryIcon category={c} className="size-4" />
                          </span>
                          <span className="text-sm leading-tight font-semibold">{c.name}</span>
                          <span className="text-xs text-[color:var(--sf-muted)]">
                            {productsIn(catalog, c.id).length} products
                          </span>
                        </button>
                      ))}
                  </Scroller>
                )}
                {m.productIds && m.productIds.length > 0 && (
                  <Scroller label="Suggested products">
                    {m.productIds
                      .map((id) => catalog.productMap.get(id))
                      .filter((p): p is Product => !!p)
                      .map((p) => (
                        <div
                          key={p.id}
                          className="w-44 p-2 flex shrink-0 snap-start flex-col rounded-[var(--sf-tile-radius)] border border-[color:var(--sf-line)]"
                        >
                          <ProductImage
                            product={p}
                            size="sm"
                            className="aspect-square rounded-[var(--sf-tile-radius)]"
                          />
                          <p className="mt-2 text-sm leading-snug font-semibold line-clamp-2">{p.name}</p>
                          <p className="text-sm font-bold">{fmtIdr(fromPrice(p))}</p>
                          <div className="mt-2 gap-1 flex flex-col">
                            <Link
                              to={paths.product(store, p.id)}
                              className="min-h-11 text-sm font-semibold inline-flex items-center justify-center underline underline-offset-4"
                            >
                              View item
                            </Link>
                            {quickAddable(catalog, p) && (
                              <Button variant="dark" size="sm" onClick={() => quickAdd(p)}>
                                Add to cart
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                  </Scroller>
                )}
                {m.productIds && m.productIds.length > 0 && askedFor(m.id) && customer && (
                  <button
                    type="button"
                    disabled={agent.busy}
                    onClick={() => buy(askedFor(m.id)!)}
                    className="min-h-11 gap-2 text-sm font-semibold inline-flex items-center underline underline-offset-4 disabled:opacity-50"
                  >
                    <Sparkles className="size-4" aria-hidden="true" /> Let my agent buy it
                  </button>
                )}
                {m.replies && m.id === lastReplyId && (
                  <div className="gap-2 flex flex-wrap">
                    {m.replies.map((r) => (
                      <button
                        key={r.label}
                        type="button"
                        className={pill}
                        onClick={() => ask(r.label, r.action)}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </>
  )
}

/** Switches the drawer between answering questions and the buying agent. */
function ModeSwitch({ mode, onMode, waiting }: { mode: Mode; onMode: (m: Mode) => void; waiting: boolean }) {
  const tabs: [Mode, string][] = [
    ['ask', 'Ask'],
    ['agent', 'Buy for me'],
  ]
  return (
    <div
      role="tablist"
      aria-label="Assistant mode"
      className="mb-4 p-1 grid grid-cols-2 rounded-[var(--sf-pill)] bg-[var(--sf-soft)]"
    >
      {tabs.map(([m, label]) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          onClick={() => onMode(m)}
          className={cn(
            'min-h-10 gap-1.5 text-sm font-semibold inline-flex items-center justify-center rounded-[var(--sf-pill)] transition-colors',
            mode === m
              ? 'bg-[var(--sf-bg)] shadow-card'
              : 'text-[color:var(--sf-muted)] hover:text-[color:var(--sf-text)]',
          )}
        >
          {m === 'agent' && <Sparkles className="size-4" aria-hidden="true" />}
          {label}
          {m === 'agent' && waiting && (
            <span className="size-2 rounded-full bg-[var(--sf-primary)]">
              <span className="sr-only">, waiting for your approval</span>
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
