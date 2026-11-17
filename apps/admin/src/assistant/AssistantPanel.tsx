import { ApiError, type AssistantAction, type AssistantAnswer, type AssistantOutcome } from '@rc/api'
import { newId, nowMs } from '@rc/fixtures'
import {
  Badge,
  Button,
  Chip,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Textarea,
  cn,
  toast,
  useMediaQuery,
} from '@rc/ui'
import { ArrowUp, LoaderCircle, Sparkles, SquarePen, ThumbsDown, ThumbsUp, TriangleAlert } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/auth'
import { HTTP, api } from '../lib/api'
import { useScoped } from '../state/scoped'
import {
  ACTION_PERMISSION,
  describeAction,
  doneTitle,
  lookedUp,
  riskWarning,
  startersFor,
  toAppAction,
} from './lib'

/** `confirming` is the second step of a high-risk card. */
type CardState = 'open' | 'confirming' | 'running' | 'done' | 'failed' | 'dismissed'

interface Card {
  action: AssistantAction
  state: CardState
  error?: string
}

interface Turn {
  id: string
  role: 'user' | 'assistant'
  text: string
  cards?: Card[]
  links?: AssistantAnswer['links']
  /** The answer's id in the assistant log, for outcomes and ratings. */
  answerId?: string
  lookups?: string[]
  feedback?: 'up' | 'down'
  /** An error the console wrote; it never goes back to the model. */
  failed?: boolean
}

const MAX_QUESTION = 1000

/** The conversation lives in this tab only; a new tab starts a new chat. */
function load(key: string): Turn[] {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Turn[]) : []
  } catch {
    return []
  }
}

function save(key: string, turns: Turn[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify(turns))
  } catch {
    // Storage is full or blocked; the chat still works until a reload.
  }
}

function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 503)
      return 'The assistant is turned off on this server. Ask whoever runs it to set a model key.'
    if (err.status === 502) return 'The assistant did not answer. Try again in a moment.'
    if (err.status === 429) return err.message
  }
  return `Could not reach the assistant. ${(err as Error).message}`
}

/** The floating "Ask AI" button and the assistant panel it opens. */
export function AssistantLauncher() {
  const { tenant } = useAuth()
  const [open, setOpen] = useState(false)
  const wide = useMediaQuery('(min-width: 768px)')
  if (!tenant) return null
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="right-4 h-11 gap-2 px-4 text-sm font-semibold md:right-5 md:bottom-5 fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 inline-flex items-center rounded-full bg-ink text-on-ink shadow-float transition-transform active:scale-[0.98] print:hidden">
        <Sparkles aria-hidden="true" className="size-4" />
        Ask AI
      </SheetTrigger>
      <SheetContent
        side={wide ? 'right' : 'bottom'}
        size="lg"
        className={cn(!wide && 'flex h-[85dvh] flex-col overflow-hidden')}
      >
        {open && <AssistantChat onClose={() => setOpen(false)} />}
      </SheetContent>
    </Sheet>
  )
}

function AssistantChat({ onClose }: { onClose: () => void }) {
  const s = useScoped()
  const { can } = useAuth()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const key = `rc.admin.assistant.${s.tenantId}`
  const [turns, setTurns] = useState<Turn[]>(() => load(key))
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    save(key, turns)
  }, [key, turns])
  // Block bodies: newer browsers return a promise from scrollIntoView, which React would call on cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [turns.length, busy])

  const ask = async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    const asked: Turn[] = [...turns, { id: newId('turn'), role: 'user', text }]
    setTurns(asked)
    setDraft('')
    setBusy(true)
    try {
      const answer = await api.assistant(s.tenantId, {
        messages: asked
          .filter((t) => !t.failed)
          .slice(-8)
          .map((t) => ({ role: t.role, text: t.text })),
        page: pathname + search,
      })
      setTurns((list) => [
        ...list,
        {
          id: newId('turn'),
          role: 'assistant',
          text: answer.answer,
          cards: answer.actions.map((action) => ({ action, state: 'open' })),
          links: answer.links,
          answerId: answer.id,
          lookups: answer.lookups,
        },
      ])
    } catch (err) {
      setTurns((list) => [
        ...list,
        { id: newId('turn'), role: 'assistant', text: errorText(err), failed: true },
      ])
    } finally {
      setBusy(false)
    }
  }

  const setCard = (turnId: string, index: number, patch: Partial<Card>) =>
    setTurns((list) =>
      list.map((t) =>
        t.id === turnId ? { ...t, cards: t.cards?.map((c, i) => (i === index ? { ...c, ...patch } : c)) } : t,
      ),
    )

  /** Tells the log what happened to a card. A failure here never disturbs the chat. */
  const report = (turn: Turn, index: number, outcome: AssistantOutcome) => {
    if (turn.answerId) void api.assistantLog.outcome(turn.answerId, index, outcome).catch(() => undefined)
  }

  const rate = (turn: Turn, feedback: 'up' | 'down') => {
    if (!turn.answerId || turn.feedback) return
    setTurns((list) => list.map((t) => (t.id === turn.id ? { ...t, feedback } : t)))
    void api.assistantLog.feedback(turn.answerId, feedback).catch(() => undefined)
  }

  const confirm = async (turn: Turn, index: number, action: AssistantAction) => {
    const turnId = turn.id
    setCard(turnId, index, { state: 'running' })
    const promotionCodes = new Set(s.promotions.map((p) => p.code.toUpperCase()))
    try {
      // The normal dispatch: the API checks the permission and the record again.
      await s.dispatchAsync(toAppAction(action, { tenantId: s.tenantId, promotionCodes, now: nowMs() }))
      setCard(turnId, index, { state: 'done' })
      report(turn, index, 'confirmed')
      toast(doneTitle(action), { tone: 'success', description: describeAction(action) })
    } catch (err) {
      const message = (err as Error).message
      setCard(turnId, index, { state: 'failed', error: message })
      report(turn, index, 'failed')
      toast('The change was not saved', { tone: 'danger', description: message })
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void ask(draft)
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="gap-2 flex items-center">
          <Sparkles aria-hidden="true" className="size-4 text-accent" />
          Ask AI
        </SheetTitle>
        <SheetDescription>
          Answers come from this brand's data. Nothing changes until you press Confirm.
        </SheetDescription>
      </SheetHeader>

      {!HTTP ? (
        <SheetBody>
          <p className="p-4 text-sm rounded-2xl bg-surface text-body">
            The assistant needs the server. This console is running on demo data in your browser, so there is
            nothing for it to read yet.
          </p>
        </SheetBody>
      ) : (
        <>
          <SheetBody className="space-y-3" aria-live="polite">
            {turns.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted">Try one of these, or ask your own question.</p>
                <div className="gap-2 flex flex-wrap">
                  {startersFor(pathname).map((q) => (
                    <Chip key={q} onClick={() => void ask(q)}>
                      {q}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            {turns.map((turn) =>
              turn.role === 'user' ? (
                <p
                  key={turn.id}
                  className="px-3.5 py-2.5 text-sm rounded-2xl rounded-br-md ml-auto w-fit max-w-[85%] bg-ink whitespace-pre-line text-on-ink"
                >
                  {turn.text}
                </p>
              ) : (
                <div key={turn.id} className="space-y-2">
                  <p
                    className={cn(
                      'px-3.5 py-2.5 text-sm rounded-2xl rounded-bl-md max-w-[92%] whitespace-pre-line',
                      turn.failed ? 'bg-danger-soft text-accent-strong' : 'bg-surface text-body',
                    )}
                  >
                    {turn.text}
                  </p>
                  {!!turn.lookups?.length && (
                    <p className="px-1 text-xs text-muted">Looked up: {lookedUp(turn.lookups)}</p>
                  )}
                  {turn.cards?.map((card, i) =>
                    can(ACTION_PERMISSION[card.action.type]) && card.state !== 'dismissed' ? (
                      <ActionCard
                        key={i}
                        card={card}
                        onConfirm={() =>
                          card.action.risk === 'high' && card.state === 'open'
                            ? setCard(turn.id, i, { state: 'confirming' })
                            : void confirm(turn, i, card.action)
                        }
                        onBack={() => setCard(turn.id, i, { state: 'open' })}
                        onDismiss={() => {
                          setCard(turn.id, i, { state: 'dismissed' })
                          report(turn, i, 'dismissed')
                        }}
                      />
                    ) : null,
                  )}
                  {!!turn.links?.length && (
                    <div className="gap-2 flex flex-wrap">
                      {turn.links.map((link) => (
                        <Chip
                          key={link.path}
                          onClick={() => {
                            onClose()
                            void navigate(link.path)
                          }}
                        >
                          {link.label}
                        </Chip>
                      ))}
                    </div>
                  )}
                  {turn.answerId && !turn.failed && (
                    <div className="gap-1 flex items-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Helpful answer"
                        aria-pressed={turn.feedback === 'up'}
                        disabled={!!turn.feedback}
                        className={cn(turn.feedback === 'up' && 'text-accent')}
                        onClick={() => rate(turn, 'up')}
                      >
                        <ThumbsUp aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Not helpful"
                        aria-pressed={turn.feedback === 'down'}
                        disabled={!!turn.feedback}
                        className={cn(turn.feedback === 'down' && 'text-accent')}
                        onClick={() => rate(turn, 'down')}
                      >
                        <ThumbsDown aria-hidden="true" />
                      </Button>
                      {turn.feedback && <span className="text-xs text-muted">Thanks for the rating.</span>}
                    </div>
                  )}
                </div>
              ),
            )}
            {busy && (
              <div className="gap-2 text-sm flex items-center text-muted">
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                Reading your store data
              </div>
            )}
            <div ref={end} />
          </SheetBody>

          <SheetFooter className="gap-2 flex-col items-stretch">
            <form onSubmit={submit} className="gap-2 flex items-end">
              <Textarea
                aria-label="Your question"
                rows={2}
                maxLength={MAX_QUESTION}
                value={draft}
                placeholder="Ask about sales, orders, stock or customers"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void ask(draft)
                  }
                }}
                className="min-h-0 flex-1 resize-none"
              />
              <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label="Send">
                <ArrowUp aria-hidden="true" />
              </Button>
            </form>
            {turns.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                disabled={busy}
                onClick={() => setTurns([])}
              >
                <SquarePen aria-hidden="true" />
                New chat
              </Button>
            )}
          </SheetFooter>
        </>
      )}
    </>
  )
}

function ActionCard({
  card,
  onConfirm,
  onBack,
  onDismiss,
}: {
  card: Card
  onConfirm: () => void
  onBack: () => void
  onDismiss: () => void
}) {
  const { action, state } = card
  const warning = riskWarning(action)
  return (
    <div
      className={cn(
        'space-y-2 p-3.5 min-w-0 rounded-2xl border bg-card',
        warning && state !== 'done' ? 'border-danger' : 'border-border',
      )}
    >
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <p className="text-sm font-semibold min-w-0 break-words">{action.label || describeAction(action)}</p>
        {state === 'done' && <Badge variant="success">Done</Badge>}
        {state === 'failed' && <Badge variant="danger">Not saved</Badge>}
      </div>
      <p className="text-sm break-words text-body">{describeAction(action)}</p>
      {action.reason && <p className="text-xs break-words text-muted">{action.reason}</p>}
      {warning && state !== 'done' && (
        <p className="gap-1.5 text-xs font-medium flex items-start text-danger">
          <TriangleAlert aria-hidden="true" className="size-3.5 mt-px shrink-0" />
          {warning}
        </p>
      )}
      {state === 'failed' && card.error && <p className="text-xs text-accent-strong">{card.error}</p>}
      {state === 'confirming' && (
        <div className="gap-2 flex flex-wrap items-center">
          <span className="text-sm font-medium">Are you sure?</span>
          <Button size="sm" variant="danger" onClick={onConfirm}>
            Yes, do it
          </Button>
          <Button size="sm" variant="outline" onClick={onBack}>
            Back
          </Button>
        </div>
      )}
      {(state === 'open' || state === 'running' || state === 'failed') && (
        <div className="gap-2 flex flex-wrap items-center">
          <Button size="sm" onClick={onConfirm} disabled={state === 'running'}>
            {state === 'running' ? 'Saving' : state === 'failed' ? 'Try again' : 'Confirm'}
          </Button>
          <Button size="sm" variant="outline" onClick={onDismiss} disabled={state === 'running'}>
            Dismiss
          </Button>
        </div>
      )}
    </div>
  )
}
