import { fmtTime, plural, toMs } from '@rc/fixtures'
import type { Customer } from '@rc/types'
import { CUSTOMER_EVENT_LABEL } from '@rc/types'
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Textarea, cn, toast } from '@rc/ui'
import { type Ref, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { OrderLink, paths } from '../../components/links'
import { useScoped } from '../../state/scoped'
import { CUSTOMER_EVENT_ICON, groupByDay } from './lib'

const PAGE = 15

/** Everything the customer did and every note the team left, grouped by day, newest first. */
export function TimelineCard({
  customer,
  now,
  canNote,
  composerRef,
}: {
  customer: Customer
  now: number
  canNote: boolean
  composerRef: Ref<HTMLTextAreaElement>
}) {
  const s = useScoped()
  const [note, setNote] = useState('')
  const [shown, setShown] = useState(PAGE)

  // Events stamped after the app clock have not happened yet.
  const events = useMemo(
    () =>
      s.customerEvents
        .filter((e) => e.customerId === customer.id && toMs(e.at) <= now)
        .sort((a, b) => toMs(b.at) - toMs(a.at)),
    [s.customerEvents, customer.id, now],
  )
  const groups = useMemo(() => groupByDay(events.slice(0, shown), now), [events, shown, now])
  const more = events.length - shown

  const post = () => {
    const text = note.trim()
    if (!text) return
    s.dispatch({ type: 'customers/note', id: customer.id, note: text })
    setNote('')
    toast('Note posted', { tone: 'success', description: `${customer.name} · visible to your team only` })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
        <p className="text-sm text-muted">
          {events.length
            ? `${plural(events.length, 'event')}, newest first`
            : 'Visits, carts, orders, campaigns and notes appear here.'}
        </p>
      </CardHeader>
      <CardContent>
        {canNote && (
          <div className="mb-5 gap-2 sm:flex-row sm:items-end flex flex-col">
            <Textarea
              ref={composerRef}
              variant="soft"
              rows={2}
              className="min-h-11 flex-1"
              aria-label="Note for the team"
              placeholder="Add a note for the team, such as a call summary or a preference"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  post()
                }
              }}
            />
            <Button variant="secondary" onClick={post} disabled={!note.trim()}>
              Post
            </Button>
          </div>
        )}
        {groups.length === 0 ? (
          <EmptyState
            compact
            title="No activity yet"
            description="The timeline fills as the customer browses, buys and hears from campaigns."
          />
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.key} aria-label={g.label}>
                <h3 className="mb-3 font-semibold tracking-wider text-[0.6875rem] text-muted uppercase">
                  {g.label}
                </h3>
                <ol className="space-y-4 before:bottom-2 before:top-2 relative before:absolute before:left-[1.0625rem] before:w-px before:bg-border">
                  {g.events.map((e) => {
                    const Icon = CUSTOMER_EVENT_ICON[e.kind]
                    const isNote = e.kind === 'note'
                    return (
                      <li key={e.id} className="gap-3 relative flex">
                        <span
                          className={cn(
                            'size-9 [&_svg]:size-4 relative flex shrink-0 items-center justify-center rounded-full ring-4 ring-card',
                            isNote
                              ? 'bg-info-soft text-info'
                              : e.kind === 'checkout_abandoned'
                                ? 'bg-accent-soft text-accent'
                                : e.kind === 'purchase'
                                  ? 'bg-ink text-on-ink'
                                  : 'bg-surface text-body',
                          )}
                        >
                          <Icon aria-hidden="true" />
                        </span>
                        <div className="min-w-0 pt-1 flex-1">
                          <p
                            className={cn(
                              'text-sm',
                              isNote ? 'rounded-2xl px-3 py-2 bg-surface-2' : 'font-medium',
                            )}
                          >
                            {e.label}
                          </p>
                          <p className="mt-0.5 gap-x-1.5 text-xs flex flex-wrap items-center text-muted">
                            <span>{CUSTOMER_EVENT_LABEL[e.kind]}</span>
                            <span>·</span>
                            <span className="tabular-nums">{fmtTime(e.at)}</span>
                            {e.by && (
                              <>
                                <span>·</span>
                                <span>{s.userName(e.by)}</span>
                              </>
                            )}
                            {e.orderId && (
                              <>
                                <span>·</span>
                                <OrderLink orderId={e.orderId} className="text-[0.6875rem]" />
                              </>
                            )}
                            {e.productId && (
                              <>
                                <span>·</span>
                                <Link
                                  to={paths.product(e.productId)}
                                  className="font-medium truncate text-body hover:text-accent"
                                >
                                  {s.productName(e.productId)}
                                </Link>
                              </>
                            )}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
        {more > 0 && (
          <div className="mt-5 flex justify-center">
            <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
              {Math.min(PAGE, more)} more
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
