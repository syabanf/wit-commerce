import { fmtAgo, fmtIdrShort } from '@rc/fixtures'
import type { Lead } from '@rc/types'
import { IconTile, type Tone, cn } from '@rc/ui'
import { Building2, Clock, User } from 'lucide-react'
import { Link } from 'react-router'
import { paths } from '../lib/paths'
import { isOpenLead, isStale } from '../lib/seller'
import { useSellerScope } from '../state/scope'
import { LeadStageBadge } from './badges'

const cardClass =
  'rounded-[24px] bg-card shadow-card transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 active:scale-[0.98]'

/** "Touched 3d ago", in warning once the lead has gone stale. */
function Touched({ lead, now }: { lead: Lead; now: number }) {
  const stale = isStale(lead, now)
  return (
    <span
      className={cn(
        'min-w-0 gap-1 text-xs flex items-center',
        stale ? 'font-semibold text-warning' : 'text-muted',
      )}
    >
      <Clock aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">Touched {fmtAgo(lead.updatedAt, now)}</span>
    </span>
  )
}

/** A lead in a list: who, the deal value, the stage, the product and when it was last touched. */
export function LeadCard({ lead, now }: { lead: Lead; now: number }) {
  const { productName } = useSellerScope()
  const tone: Tone = !isOpenLead(lead)
    ? 'default'
    : isStale(lead, now)
      ? 'warning'
      : lead.stage === 'new'
        ? 'danger'
        : 'info'
  return (
    <Link
      to={paths.lead(lead.id)}
      className={cn(cardClass, 'gap-3 p-4 flex', lead.stage === 'lost' && 'bg-card/70')}
    >
      <IconTile tone={tone} size="lg" shape="round">
        {lead.company ? <Building2 aria-hidden="true" /> : <User aria-hidden="true" />}
      </IconTile>
      <div className="min-w-0 flex-1">
        <div className="gap-2 flex items-center justify-between">
          <p className="font-semibold truncate text-[15px]">{lead.company || lead.name}</p>
          <span className="text-sm font-bold shrink-0 tabular-nums">{fmtIdrShort(lead.value)}</span>
        </div>
        <p className="mt-0.5 truncate text-[13px] text-muted">
          <span className="text-xs font-mono">{lead.code}</span>
          {lead.company ? ` · ${lead.name}` : ''}
        </p>
        <p className="mt-2 text-sm truncate text-body">{productName(lead.productId)}</p>
        <div className="mt-2 gap-2 flex items-center justify-between">
          <Touched lead={lead} now={now} />
          <LeadStageBadge stage={lead.stage} />
        </div>
      </div>
    </Link>
  )
}

/** A compact lead for the Home snap rail. */
export function LeadRailCard({ lead, now }: { lead: Lead; now: number }) {
  const { productName } = useSellerScope()
  return (
    <Link to={paths.lead(lead.id)} className={cn(cardClass, 'w-44 p-4 flex shrink-0 snap-start flex-col')}>
      <div className="gap-2 flex items-center justify-between">
        <IconTile tone={isStale(lead, now) ? 'warning' : 'default'} size="sm" shape="round">
          <Clock aria-hidden="true" />
        </IconTile>
        <span className="text-sm font-bold tabular-nums">{fmtIdrShort(lead.value)}</span>
      </div>
      <p className="mt-3 truncate font-mono text-[11px] text-muted">{lead.code}</p>
      <p className="mt-0.5 text-sm font-semibold leading-snug line-clamp-2">{lead.company || lead.name}</p>
      <p className="text-xs truncate text-muted">{productName(lead.productId)}</p>
      <div className="pt-3 mt-auto">
        <Touched lead={lead} now={now} />
      </div>
    </Link>
  )
}
