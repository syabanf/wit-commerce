import { fmtIdr } from '@rc/fixtures'
import type { Product } from '@rc/types'
import { cn } from '@rc/ui'
import { Bot, SendHorizontal } from 'lucide-react'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
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
import { useShop } from '../state/shop'
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'right-4 bottom-24 size-14 md:right-6 md:bottom-6 fixed z-40 inline-flex items-center justify-center bg-[var(--sf-text)] text-[color:var(--sf-bg)] shadow-float transition-transform hover:scale-105',
          hairline ? 'rounded-[var(--sf-pill)]' : 'rounded-full',
          hidden && 'hidden',
        )}
        aria-haspopup="dialog"
        title={`Ask ${tenant.name}`}
      >
        <Bot className="size-6" aria-hidden="true" />
        <span className="sr-only">Ask {tenant.name}</span>
      </button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={`Ask ${tenant.name}`}
        description="Answers come from this store's catalog."
        bodyClassName="pb-2"
        footer={
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
        }
      >
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
                            onClick={() => setOpen(false)}
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
      </Drawer>
    </>
  )
}
