import { fmtDateTime, fmtIdr, fmtWhen, metricsFor, plural, toMs } from '@rc/fixtures'
import type { Ticket } from '@rc/types'
import { CUSTOMER_EVENT_LABEL, TICKET_KIND_LABEL, TICKET_STATUS_LABEL } from '@rc/types'
import {
  Badge,
  Button,
  KeyValue,
  Kicker,
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetTitle,
  cn,
  toast,
} from '@rc/ui'
import { CircleCheck, X } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { useAuth } from '../../auth/auth'
import { ON_INK, OrderStatusBadge, TierBadge } from '../../components/badges'
import { CustomerLink, OrderLink } from '../../components/links'
import { UserPicker } from '../../components/pickers'
import { useScoped } from '../../state/scoped'
import { TICKET_CHANNEL_LABEL, isLate, slaText } from './lib'

/** Quick triage for one ticket: who the customer is, the order behind it, assign and resolve. */
export function TicketSheet({
  ticket,
  now,
  onClose,
}: {
  ticket: Ticket | null
  now: number
  onClose: () => void
}) {
  return (
    <Sheet open={!!ticket} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" size="lg" hideClose>
        {ticket && <TicketPanel ticket={ticket} now={now} />}
      </SheetContent>
    </Sheet>
  )
}

function TicketPanel({ ticket, now }: { ticket: Ticket; now: number }) {
  const s = useScoped()
  const { can } = useAuth()
  const manage = can('ticket.manage')
  const customer = s.maps.customer.get(ticket.customerId)
  const order = ticket.orderId ? s.maps.order.get(ticket.orderId) : undefined
  const metrics = metricsFor(s.crm.metrics, ticket.customerId)
  const late = isLate(ticket, now)
  const recent = useMemo(
    () =>
      s.customerEvents
        .filter((e) => e.customerId === ticket.customerId && toMs(e.at) <= now)
        .sort((a, b) => toMs(b.at) - toMs(a.at))
        .slice(0, 3),
    [s.customerEvents, ticket.customerId, now],
  )

  const assign = (assigneeId: string | null) => {
    s.dispatch({ type: 'tickets/assign', id: ticket.id, assigneeId })
    toast(assigneeId ? 'Ticket assigned' : 'Ticket unassigned', {
      tone: 'success',
      description: `${ticket.code} · ${s.userName(assigneeId)}`,
    })
  }
  const resolve = () => {
    s.dispatch({ type: 'tickets/resolve', id: ticket.id })
    toast('Ticket resolved', { tone: 'success', description: `${ticket.code} · ${ticket.subject}` })
  }

  return (
    <>
      <div className="m-2 mb-0 p-5 relative overflow-hidden rounded-card bg-ink text-on-ink">
        <div className="gap-3 flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-mono text-on-ink-muted">
              {ticket.code} · {TICKET_KIND_LABEL[ticket.kind]} · {TICKET_CHANNEL_LABEL[ticket.channel]}
            </p>
            <SheetTitle className="mt-1 text-xl font-bold tracking-tight">{ticket.subject}</SheetTitle>
            <SheetDescription className="mt-1 text-sm text-on-ink-muted">
              Opened {fmtWhen(ticket.createdAt, now)}
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="onInk" size="icon-sm" aria-label="Close">
              <X />
            </Button>
          </SheetClose>
        </div>
        <div className="mt-4 gap-2 flex flex-wrap items-center">
          <Badge className={ON_INK}>{TICKET_STATUS_LABEL[ticket.status]}</Badge>
          <span
            className={cn(
              'px-2.5 py-0.5 text-xs font-semibold rounded-full',
              late ? 'text-white bg-accent' : 'bg-white/10',
            )}
          >
            {slaText(ticket, now)}
          </span>
        </div>
      </div>

      <SheetBody className="space-y-5 pt-5">
        <Section title="Customer">
          <div className="rounded-2xl p-3 bg-surface-2">
            <div className="gap-2 flex flex-wrap items-center justify-between">
              <CustomerLink customerId={ticket.customerId} />
              {customer && <TierBadge tier={customer.tier} />}
            </div>
            <p className="mt-2 text-xs text-muted">
              {plural(metrics.orders, 'order')} · {fmtIdr(metrics.spend)} lifetime
              {customer?.phone ? ` · ${customer.phone}` : ''}
            </p>
          </div>
          {recent.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {recent.map((e) => (
                <li key={e.id} className="gap-3 text-sm flex items-start">
                  <span className="w-24 pt-0.5 text-xs shrink-0 text-muted tabular-nums">
                    {fmtWhen(e.at, now)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{e.label}</span>
                    <span className="block text-[11px] text-muted">{CUSTOMER_EVENT_LABEL[e.kind]}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Order">
          {order ? (
            <div className="gap-3 rounded-2xl p-3 flex flex-wrap items-center bg-surface-2">
              <OrderLink orderId={order.id} />
              <OrderStatusBadge status={order.status} />
              <span className="text-sm font-semibold ml-auto tabular-nums">{fmtIdr(order.total)}</span>
            </div>
          ) : (
            <p className="text-sm text-muted">Not about a specific order.</p>
          )}
        </Section>

        <Section title="Details">
          <KeyValue
            bare
            labelWidth="md"
            items={[
              { label: 'Kind', value: TICKET_KIND_LABEL[ticket.kind] },
              { label: 'Channel', value: TICKET_CHANNEL_LABEL[ticket.channel] },
              { label: 'Opened', value: fmtDateTime(ticket.createdAt) },
              {
                label: 'SLA due',
                value: (
                  <span className={late ? 'font-semibold text-accent' : undefined}>
                    {fmtDateTime(ticket.slaDueAt)}
                  </span>
                ),
              },
              { label: 'Resolved', value: ticket.resolvedAt ? fmtDateTime(ticket.resolvedAt) : 'Not yet' },
              { label: 'Assignee', value: s.userName(ticket.assigneeId), hidden: manage },
            ]}
          />
          {manage && (
            <div className="mt-3">
              <label htmlFor="ticket-assignee" className="mb-1.5 text-sm font-medium block">
                Assignee
              </label>
              <UserPicker
                id="ticket-assignee"
                value={ticket.assigneeId}
                onChange={assign}
                clearable
                placeholder="Unassigned"
              />
            </div>
          )}
        </Section>
      </SheetBody>

      {manage && ticket.status !== 'resolved' && (
        <SheetFooter>
          <Button onClick={resolve}>
            <CircleCheck />
            Resolve ticket
          </Button>
        </SheetFooter>
      )}
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <Kicker className="mb-2">{title}</Kicker>
      {children}
    </section>
  )
}
