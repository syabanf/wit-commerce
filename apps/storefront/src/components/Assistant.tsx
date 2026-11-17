import { fmtIdr } from '@rc/fixtures'
import type { Product } from '@rc/types'
import { cn } from '@rc/ui'
import { Bot, SendHorizontal, Sparkles } from 'lucide-react'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { t, tp } from '../i18n'
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
import { HTTP, api } from '../lib/api'
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
  /** The message the model is reading. */
  const [pending, setPending] = useState<string | null>(null)
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
    text: t('agent.ask.greeting', { store: tenant.name }),
    replies: openingReplies(catalog),
    categories: true,
  })
  // The greeting is not stored, so it always reflects the live catalog.
  const stored = Array.isArray(convo?.messages) ? convo.messages : []
  const messages = stored.length ? stored : [greeting(1)]

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [messages.length, open, pending])

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
            text: t('agent.ask.unclear'),
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
                ? t('agent.ask.bestMatch')
                : t('agent.ask.picks', { count: rec.picks.length }),
            chips,
            productIds: rec.picks.map((p) => p.id),
          },
          {
            id: startId + 1,
            from: 'bot',
            text: t('agent.ask.narrow'),
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
          text: `${t('agent.ask.none')}${closest ? t('agent.ask.closest', { name: closest.name }) : ''}${
            rec.cheapest
              ? t('agent.ask.cheapest', {
                  product: rec.cheapest.name,
                  price: fmtIdr(fromPrice(rec.cheapest)),
                })
              : t('agent.ask.end')
          }`,
          chips,
          productIds: rec.cheapest ? [rec.cheapest.id] : [],
          replies: [
            ...(closest
              ? [
                  {
                    label: t('agent.ask.showAll', { name: closest.name.toLowerCase() }),
                    action: { kind: 'category', categoryId: closest.id } as ReplyAction,
                  },
                ]
              : []),
            { label: t('agent.ask.somethingElse'), action: { kind: 'reset' } },
          ],
        },
      ],
      picks: rec.cheapest ? [rec.cheapest.id] : [],
    }
  }

  const ask = (label: string, action: ReplyAction) => {
    // A quick reply tapped while the model reads would be overwritten by its answer.
    if (pending !== null) return
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
    if (!HTTP) return ask(value, { kind: 'text', text: value })
    void askModel(value)
  }

  /** The model answers from the catalog; if it cannot, the built-in reader takes the message. */
  const askModel = async (value: string) => {
    setPending(value)
    try {
      const reply = await api.shop.ai(store, {
        mode: 'ask',
        message: value,
        history: messages.map((m) => ({ from: m.from, text: m.text })),
      })
      if (!reply.reply) throw new Error('empty answer')
      const base = Math.max(0, ...messages.map((m) => m.id)) + 1
      setConvo({
        messages: [
          ...messages,
          { id: base, from: 'me' as const, text: value },
          { id: base + 1, from: 'bot' as const, text: reply.reply, productIds: reply.productIds },
        ].slice(-40),
        intent: convo.intent,
        lastPicks: reply.productIds,
      })
    } catch {
      ask(value, { kind: 'text', text: value })
    } finally {
      setPending(null)
    }
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
        title={t('agent.ask.title', { store: tenant.name })}
      >
        <Bot className="size-5 md:size-6" aria-hidden="true" />
        <span className="sr-only">{t('agent.ask.title', { store: tenant.name })}</span>
        {waiting && (
          <span className="-top-0.5 -right-0.5 size-3.5 absolute rounded-full border-2 border-[var(--sf-bg)] bg-[var(--sf-primary)]">
            <span className="sr-only">{t('agent.ask.waiting')}</span>
          </span>
        )}
      </button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        autoFocusSelector="form input"
        title={mode === 'agent' ? t('agent.ask.agentTitle') : t('agent.ask.title', { store: tenant.name })}
        description={
          mode === 'agent' ? (
            <>
              {t('agent.ask.agentNote')}{' '}
              <Link to={paths.agent(store)} className="font-semibold underline underline-offset-4">
                {t('agent.ask.settings')}
              </Link>
            </>
          ) : (
            t('agent.ask.source')
          )
        }
        bodyClassName="pb-2"
        footer={
          mode === 'agent' ? (
            <AgentComposer />
          ) : (
            <form onSubmit={submit} className="gap-2 flex w-full">
              <label htmlFor={inputId} className="sr-only">
                {t('agent.ask.messageLabel')}
              </label>
              <input
                id={inputId}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('agent.ask.placeholder')}
                autoComplete="off"
                className="h-12 min-w-0 px-4 text-base md:text-sm flex-1 rounded-[var(--sf-pill)] border border-[color:var(--sf-line)] bg-[var(--sf-bg)]"
              />
              <Button
                type="submit"
                variant={hairline ? 'dark' : 'primary'}
                aria-label={t('agent.thread.send')}
                disabled={pending !== null}
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
                  <span className="sr-only">
                    {m.from === 'me' ? t('agent.thread.you') : t('agent.ask.assistantPrefix')}
                  </span>
                  {m.text}
                </p>
                {m.chips && m.chips.length > 0 && (
                  <ul className="gap-1.5 flex flex-wrap" aria-label={t('agent.ask.understood')}>
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
                  <Scroller label={t('agent.ask.categories')}>
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
                            {tp('agent.ask.products', productsIn(catalog, c.id).length)}
                          </span>
                        </button>
                      ))}
                  </Scroller>
                )}
                {m.productIds && m.productIds.length > 0 && (
                  <Scroller label={t('agent.ask.suggested')}>
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
                              {t('agent.ask.viewItem')}
                            </Link>
                            {quickAddable(catalog, p) && (
                              <Button variant="dark" size="sm" onClick={() => quickAdd(p)}>
                                {t('agent.ask.addToCart')}
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
                    <Sparkles className="size-4" aria-hidden="true" /> {t('agent.ask.letAgent')}
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
            {pending !== null && (
              <div className="space-y-3">
                <p className={bubble('me')}>{pending}</p>
                <p className={bubble('bot')}>{t('agent.thread.reading')}</p>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  )
}

/** Switches the drawer between answering questions and the buying agent. */
function ModeSwitch({ mode, onMode, waiting }: { mode: Mode; onMode: (m: Mode) => void; waiting: boolean }) {
  const tabs: [Mode, string][] = [
    ['ask', t('agent.ask.modeAsk')],
    ['agent', t('agent.ask.modeAgent')],
  ]
  return (
    <div
      role="tablist"
      aria-label={t('agent.ask.mode')}
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
              <span className="sr-only">{t('agent.ask.modeWaiting')}</span>
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
