import { fmtAgo, fmtDate, fmtIdr, leadMoveBlocker } from '@rc/fixtures'
import { LEAD_SOURCE_LABEL, LEAD_STAGE_LABEL } from '@rc/types'
import { Banner, Button, Card, EmptyState, KeyValue, Kicker, toast } from '@rc/ui'
import { MessageCircle, Phone, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { LeadStageBadge } from '../../components/badges'
import { StickyBar } from '../../components/StickyBar'
import { DetailHeader } from '../../layouts/DetailHeader'
import { paths } from '../../lib/paths'
import { firstName, isStale, nextLeadStage, telLink, waLink } from '../../lib/seller'
import { useNow, useSellerScope } from '../../state/scope'
import { LostSheet } from './LostSheet'

export function LeadDetailPage() {
  const { id } = useParams()
  const { leads, seller, dispatch, productName, isMine, customerName } = useSellerScope()
  const now = useNow()
  const [losing, setLosing] = useState(false)
  const lead = leads.find((l) => l.id === id)

  if (!lead) {
    return (
      <div className="space-y-5">
        <DetailHeader title="Lead not found" fallback={paths.leads()} />
        <Card>
          <EmptyState
            title="This lead is not on your list"
            description="It belongs to another seller or brand, or the demo data was reset."
            action={
              <Button asChild variant="outline" className="h-11">
                <Link to={paths.leads()}>My leads</Link>
              </Button>
            }
          />
        </Card>
      </div>
    )
  }

  const next = nextLeadStage(lead)
  const blocker = next ? leadMoveBlocker(lead, next) : null
  const stale = isStale(lead, now)

  const move = () => {
    if (!next) return
    if (blocker) {
      toast('Lead not moved', { tone: 'danger', description: blocker })
      return
    }
    dispatch({ type: 'leads/move', id: lead.id, stage: next })
    if (next === 'won')
      toast('Deal won', { tone: 'success', description: `${lead.code} · ${fmtIdr(lead.value)}` })
    else
      toast(`Lead moved to ${LEAD_STAGE_LABEL[next]}`, {
        tone: 'success',
        description: `${lead.code} · ${lead.company || lead.name}`,
      })
  }

  return (
    <div className="space-y-5">
      <DetailHeader title={lead.code} mono subtitle={lead.company || lead.name} fallback={paths.leads()} />

      <Card variant="ink" className="p-6">
        <div className="gap-3 flex items-start justify-between">
          <p className="min-w-0 text-xs truncate font-mono text-on-ink-muted">
            {lead.code} · {LEAD_SOURCE_LABEL[lead.source]}
          </p>
          <LeadStageBadge stage={lead.stage} onInk />
        </div>
        <h2 className="mt-1 text-2xl font-bold leading-tight tracking-tight">{lead.company || lead.name}</h2>
        {lead.company && <p className="mt-0.5 text-sm truncate text-on-ink-muted">{lead.name}</p>}
        <Kicker className="mt-5 text-on-ink-muted">Deal value</Kicker>
        <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{fmtIdr(lead.value)}</p>
        <p className="mt-1 text-sm truncate text-on-ink-muted">{productName(lead.productId)}</p>
        {lead.lostReason && (
          <p className="mt-3 rounded-2xl bg-white/5 p-3 text-sm">Lost: {lead.lostReason}</p>
        )}
      </Card>

      <div className="gap-2 grid grid-cols-2">
        <Button asChild variant="outline" size="lg">
          <a href={telLink(lead.phone)}>
            <Phone />
            Call
          </a>
        </Button>
        <Button asChild variant="outline" size="lg">
          <a
            href={waLink(lead.phone, `Hi ${firstName(lead.name)}, this is ${firstName(seller.name)}.`)}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle />
            WhatsApp
          </a>
        </Button>
      </div>

      <KeyValue
        labelWidth="md"
        items={[
          { label: 'Contact', value: lead.name },
          { label: 'Company', value: lead.company || 'Private buyer' },
          { label: 'Phone', value: lead.phone },
          { label: 'Product', value: productName(lead.productId) },
          { label: 'Created', value: fmtDate(lead.createdAt) },
          {
            label: 'Last touched',
            value: (
              <span className={stale ? 'font-semibold text-warning' : undefined}>
                {fmtAgo(lead.updatedAt, now)}
                {stale ? ' · follow up' : ''}
              </span>
            ),
          },
          {
            label: 'Customer',
            hidden: !lead.customerId,
            value:
              lead.customerId && isMine(lead.customerId) ? (
                <Link
                  to={paths.customer(lead.customerId)}
                  className="font-semibold text-accent-strong hover:underline"
                >
                  {customerName(lead.customerId)}
                </Link>
              ) : (
                customerName(lead.customerId ?? '')
              ),
          },
        ]}
      />

      <Card className="p-5">
        <h2 className="text-base font-semibold">Note</h2>
        <p className="mt-1.5 text-sm whitespace-pre-line text-body">{lead.note || 'No note yet.'}</p>
      </Card>

      {next ? (
        <StickyBar note={blocker ?? undefined} blocked={!!blocker}>
          <Button variant="outline" size="lg" className="h-14 px-5 shrink-0" onClick={() => setLosing(true)}>
            Mark lost
          </Button>
          <Button size="lg" className="h-14 min-w-0 flex-1" disabled={!!blocker} onClick={move}>
            <span className="truncate">Move to {LEAD_STAGE_LABEL[next]}</span>
          </Button>
        </StickyBar>
      ) : (
        <Banner
          tone="neutral"
          title={lead.stage === 'won' ? 'This deal is won' : 'This lead is lost'}
          action={
            <Button asChild variant="outline" className="h-11">
              <Link to={`${paths.leads()}?new=1`}>
                <Plus />
                New lead
              </Link>
            </Button>
          }
        >
          {leadMoveBlocker(lead, 'won')}
        </Banner>
      )}

      <LostSheet lead={lead} open={losing} onOpenChange={setLosing} />
    </div>
  )
}
