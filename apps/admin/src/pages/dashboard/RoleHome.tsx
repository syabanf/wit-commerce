import { fmtAgo, fmtIdrShort, toMs } from '@rc/fixtures'
import { LEAD_STAGE_LABEL, OPEN_LEAD_STAGES, ROLE_LABEL } from '@rc/types'
import { Button, Card, EmptyState, PageHeader } from '@rc/ui'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { paths } from '../../components/links'
import type { Scoped } from '../../state/scoped'

interface Item {
  id: string
  title: string
  detail: string
  to: string
}

/** Next actions for roles that do not run the store: sales agents work leads, service works tickets. */
export function RoleHome({ s, now }: { s: Scoped; now: number }) {
  const sales = s.user.role === 'sales'
  const mySellerIds = new Set(s.sellers.filter((x) => x.userId === s.user.id).map((x) => x.id))
  const items: Item[] = sales
    ? s.leads
        .filter((l) => OPEN_LEAD_STAGES.includes(l.stage) && (!l.sellerId || mySellerIds.has(l.sellerId)))
        .sort((a, b) => toMs(a.updatedAt) - toMs(b.updatedAt))
        .slice(0, 6)
        .map((l) => ({
          id: l.id,
          title: `${l.company || l.name} · ${fmtIdrShort(l.value)}`,
          detail: `${LEAD_STAGE_LABEL[l.stage]} · last touched ${fmtAgo(l.updatedAt, now)}${l.sellerId ? '' : ' · unassigned'}`,
          to: paths.lead(l.id),
        }))
    : s.tickets
        .filter((t) => t.status !== 'resolved')
        .sort((a, b) => toMs(a.slaDueAt) - toMs(b.slaDueAt))
        .slice(0, 6)
        .map((t) => ({
          id: t.id,
          title: `${t.code} · ${t.subject}`,
          detail: `${s.customerName(t.customerId)} · ${toMs(t.slaDueAt) < now ? 'past SLA' : `due ${fmtAgo(t.slaDueAt, now)}`}`,
          to: paths.ticket(t.id),
        }))
  const queue = sales
    ? { label: 'Open leads', to: '/customers/leads' }
    : { label: 'Open support', to: '/customers/support' }

  return (
    <>
      <PageHeader
        title={`${ROLE_LABEL[s.user.role]} home`}
        description={`Your next actions at ${s.tenant.name}.`}
        actions={
          <Button asChild>
            <Link to={queue.to}>
              {queue.label}
              <ArrowRight />
            </Link>
          </Button>
        }
      />
      <Card className="p-5">
        <h2 className="text-lg font-semibold">{sales ? 'Leads to follow up' : 'Tickets to answer'}</h2>
        {items.length === 0 ? (
          <EmptyState
            compact
            title={sales ? 'No open leads' : 'No open tickets'}
            description={
              sales
                ? 'New Talk to sales requests and personal store enquiries land here.'
                : 'Customer questions from WhatsApp, chat and email land here.'
            }
          />
        ) : (
          <div className="mt-4 gap-2 sm:grid-cols-2 grid grid-cols-1">
            {items.map((i) => (
              <Link
                key={i.id}
                to={i.to}
                className="rounded-2xl p-4 bg-surface-2 transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
              >
                <span className="text-sm font-semibold block truncate">{i.title}</span>
                <span className="mt-1 text-xs block truncate text-muted">{i.detail}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}
