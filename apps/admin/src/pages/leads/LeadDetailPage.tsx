import { fmtDateTime, fmtIdr, fmtIdrShort, fmtWhen, leadMoveBlocker, newId, nowIso } from '@rc/fixtures'
import type { Customer, Lead } from '@rc/types'
import { LEAD_SOURCE_LABEL, LEAD_STAGE_FLOW, LEAD_STAGE_LABEL } from '@rc/types'
import {
  ActionMenu,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  KeyValue,
  Steps,
  type StepsProps,
  Textarea,
  toast,
} from '@rc/ui'
import { ArrowRight, Ban, Copy, MoreHorizontal, Pencil, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { ON_INK } from '../../components/badges'
import { CustomerLink, ProductLink, SellerChip, paths } from '../../components/links'
import { type Scoped, useNow, useScoped } from '../../state/scoped'
import { nextCustomerCode, nextCustomerColor } from '../customers/lib'
import { LeadDialog } from './LeadDialog'
import { LEAD_SOURCE_CHANNEL, isOpen, nextLeadStage, staleDays } from './lib'

const LIST = '/customers/leads'
type Pending = 'edit' | 'lost' | null

function leadSteps(lead: Lead): StepsProps['steps'] {
  if (lead.stage === 'lost') {
    return [
      ...LEAD_STAGE_FLOW.map((stage, i) => ({
        key: stage,
        label: LEAD_STAGE_LABEL[stage],
        state: i === 0 ? ('done' as const) : ('skipped' as const),
      })),
      { key: 'lost', label: LEAD_STAGE_LABEL.lost, state: 'current' as const },
    ]
  }
  const index = LEAD_STAGE_FLOW.indexOf(lead.stage)
  return LEAD_STAGE_FLOW.map((stage, i) => ({
    key: stage,
    label: LEAD_STAGE_LABEL[stage],
    state: i < index || (stage === 'won' && i === index) ? 'done' : i === index ? 'current' : 'upcoming',
  }))
}

/** Links a won lead to a customer: an existing one with the same phone, or a new record. */
function convertLead(s: Scoped, lead: Lead): { customer: Customer; created: boolean } {
  const phone = lead.phone.replace(/\D/g, '')
  const existing = phone ? s.customers.find((c) => c.phone.replace(/\D/g, '') === phone) : undefined
  if (existing) return { customer: existing, created: false }
  const category = lead.productId ? s.maps.product.get(lead.productId)?.categoryId : undefined
  const seller = lead.sellerId ? s.maps.seller.get(lead.sellerId) : undefined
  return {
    created: true,
    customer: {
      id: newId('cus'),
      tenantId: s.tenantId,
      code: nextCustomerCode(s.customers, s.tenant),
      name: lead.name,
      email: '',
      phone: lead.phone,
      city: seller?.city ?? '',
      source: LEAD_SOURCE_CHANNEL[lead.source],
      stage: 'first_buyer',
      tier: 'member',
      points: 0,
      tags: lead.company ? ['b2b', 'from-lead'] : ['from-lead'],
      interests: category ? [category] : [],
      sellerId: lead.sellerId,
      createdAt: nowIso(),
      birthday: null,
      color: nextCustomerColor(s.customers, s.tenant.brand.colors.primary),
    },
  }
}

export function LeadDetailPage() {
  const { id } = useParams()
  const s = useScoped()
  const { can } = useAuth()
  const now = useNow(60_000)
  const [pending, setPending] = useState<Pending>(null)
  const [reason, setReason] = useState('')
  const lead = s.leads.find((l) => l.id === id)

  if (!lead) {
    return (
      <Card>
        <EmptyState
          title="Lead not found"
          description="It may have been removed or belongs to another brand."
          action={<BackButton fallback={LIST} />}
        />
      </Card>
    )
  }

  const manage = can('lead.manage')
  const next = nextLeadStage(lead)
  const moveBlock = next ? leadMoveBlocker(lead, next) : null
  const stale = staleDays(lead, now)
  const seller = lead.sellerId ? s.maps.seller.get(lead.sellerId) : undefined
  const canConvert = manage && can('customer.manage') && lead.stage === 'won' && !lead.customerId

  const move = () => {
    if (!next || moveBlock) return
    s.dispatch({ type: 'leads/move', id: lead.id, stage: next })
    toast(next === 'won' ? 'Lead won' : `Moved to ${LEAD_STAGE_LABEL[next].toLowerCase()}`, {
      tone: 'success',
      description: `${lead.code} · ${lead.company || lead.name} · ${fmtIdr(lead.value)}`,
    })
  }

  const markLost = () => {
    const text = reason.trim()
    if (!text) return
    s.dispatch({ type: 'leads/move', id: lead.id, stage: 'lost', lostReason: text })
    toast('Lead marked lost', { description: `${lead.code} · ${text}` })
    setPending(null)
    setReason('')
  }

  const convert = () => {
    const { customer, created } = convertLead(s, lead)
    if (created) s.dispatch({ type: 'customers/save', customer })
    s.dispatch({ type: 'leads/save', lead: { ...lead, customerId: customer.id } })
    toast(created ? 'Customer created' : 'Linked to existing customer', {
      tone: 'success',
      description: `${customer.name} · ${customer.code}${created ? '' : ' has the same phone number'}`,
    })
  }

  const copyPhone = () => {
    navigator.clipboard
      .writeText(lead.phone)
      .then(() => toast('Phone number copied', { description: lead.phone }))
      .catch(() =>
        toast('Could not copy the phone number', {
          tone: 'danger',
          description: 'Select it in the Contact card and copy it by hand.',
        }),
      )
  }

  return (
    <div className="space-y-4">
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <BackButton fallback={LIST} />
        <div className="gap-2 flex flex-wrap items-center">
          {manage && next && (
            <Button onClick={move} disabled={!!moveBlock} title={moveBlock ?? undefined}>
              Move to {LEAD_STAGE_LABEL[next].toLowerCase()}
              <ArrowRight />
            </Button>
          )}
          {canConvert && (
            <Button variant="outline" onClick={convert}>
              <UserPlus />
              Convert to customer
            </Button>
          )}
          {manage && isOpen(lead) && (
            <Button variant="outline" onClick={() => setPending('lost')}>
              <Ban />
              Mark lost
            </Button>
          )}
          {manage && (
            <Button variant="outline" onClick={() => setPending('edit')}>
              <Pencil />
              Edit
            </Button>
          )}
          <ActionMenu
            title={lead.code}
            trigger={
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            }
            items={[
              {
                key: 'phone',
                label: 'Copy phone number',
                description: lead.phone || 'No phone on file',
                icon: <Copy />,
                disabled: !lead.phone,
                onSelect: copyPhone,
              },
            ]}
          />
        </div>
      </div>

      {manage && next && moveBlock && (
        <Card className="p-4 text-sm">
          <span className="font-semibold">Cannot move to {LEAD_STAGE_LABEL[next].toLowerCase()} yet:</span>{' '}
          {moveBlock}
        </Card>
      )}

      <Card variant="ink" className="p-5">
        <div className="gap-3 flex flex-wrap items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-mono text-on-ink-muted">
              {lead.code} · {LEAD_SOURCE_LABEL[lead.source]}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{lead.company || lead.name}</h1>
            <p className="mt-1 gap-x-2 text-sm flex flex-wrap items-center text-on-ink-muted">
              {lead.company && <span>{lead.name}</span>}
              {lead.company && <span>·</span>}
              <span>{lead.phone}</span>
            </p>
          </div>
          <div className="gap-2 flex flex-wrap items-center">
            <Badge className={ON_INK}>{LEAD_STAGE_LABEL[lead.stage]}</Badge>
            <span className="gap-2 bg-white/10 py-1 pl-1 pr-3 text-xs font-semibold inline-flex items-center rounded-full">
              {seller ? <Avatar name={seller.name} color={seller.color} size="xs" /> : null}
              {seller?.name ?? 'Unassigned'}
            </span>
          </div>
        </div>
        <div className="mt-6">
          <p className="font-semibold tracking-wider text-[0.6875rem] text-on-ink-muted uppercase">Deal value</p>
          <p className="mt-1 text-5xl font-bold tracking-tight sm:text-6xl truncate tabular-nums">
            {lead.value ? fmtIdrShort(lead.value) : 'Not set'}
          </p>
          {lead.value > 0 && (
            <p className="mt-2 text-sm text-on-ink-muted tabular-nums">{fmtIdr(lead.value)}</p>
          )}
        </div>
        {lead.stage === 'lost' && (
          <p className="mt-4 rounded-2xl bg-white/10 px-3 py-2 text-sm">
            Lost: {lead.lostReason ?? 'No reason recorded'}.
          </p>
        )}
        {stale !== null && (
          <p className="mt-4 rounded-2xl px-3 py-2 text-sm bg-warning/20">
            No update for {stale} days. Call or message the contact and log what you agreed.
          </p>
        )}
        {lead.stage === 'won' && !lead.customerId && (
          <p className="mt-4 rounded-2xl bg-white/10 px-3 py-2 text-sm">
            Won. Convert the lead to a customer so orders, loyalty and campaigns follow them.
          </p>
        )}
      </Card>

      <Card className="p-5">
        <Steps steps={leadSteps(lead)} />
      </Card>

      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValue
              bare
              labelWidth="md"
              items={[
                { label: 'Name', value: lead.name },
                { label: 'Company', value: lead.company || 'None' },
                {
                  label: 'Phone',
                  value: lead.phone ? (
                    <a href={`tel:${lead.phone.replace(/\s/g, '')}`} className="hover:text-accent">
                      {lead.phone}
                    </a>
                  ) : (
                    'None'
                  ),
                },
                {
                  label: 'Customer',
                  value: lead.customerId ? <CustomerLink customerId={lead.customerId} /> : 'Not yet',
                },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Deal</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValue
              bare
              labelWidth="md"
              items={[
                {
                  label: 'Product',
                  value: lead.productId ? <ProductLink productId={lead.productId} /> : 'None',
                },
                { label: 'Source', value: LEAD_SOURCE_LABEL[lead.source] },
                {
                  label: 'Seller',
                  value: lead.sellerId ? <SellerChip sellerId={lead.sellerId} /> : 'Unassigned',
                },
                { label: 'Created', value: fmtDateTime(lead.createdAt) },
                { label: 'Last touched', value: fmtWhen(lead.updatedAt, now) },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader
          action={
            manage && (
              <Button variant="ghost" size="sm" onClick={() => setPending('edit')}>
                Edit note
              </Button>
            )
          }
        >
          <CardTitle>Note</CardTitle>
        </CardHeader>
        <CardContent>
          {lead.note ? (
            <p className="rounded-2xl px-4 py-3 text-sm bg-surface-2 whitespace-pre-line">{lead.note}</p>
          ) : (
            <p className="text-sm text-muted">No note yet. Record needs, budget and timeline here.</p>
          )}
          {lead.customerId && (
            <p className="mt-3 text-sm text-muted">
              Converted. Follow the customer on their{' '}
              <Link
                to={paths.customer(lead.customerId)}
                className="font-semibold text-foreground hover:text-accent"
              >
                Customer 360
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>

      <LeadDialog open={pending === 'edit'} onOpenChange={(o) => !o && setPending(null)} editing={lead} />
      <ConfirmDialog
        open={pending === 'lost'}
        onOpenChange={(o) => {
          if (!o) {
            setPending(null)
            setReason('')
          }
        }}
        destructive
        title={`Mark ${lead.code} as lost?`}
        description="The lead leaves the open pipeline and counts against the win rate. It cannot move again."
        confirmLabel="Mark lost"
        cancelLabel="Keep open"
        confirmDisabled={!reason.trim()}
        onConfirm={markLost}
      >
        <Textarea
          aria-label="Reason"
          variant="soft"
          autoFocus
          className="min-h-20"
          placeholder="Chose a competitor on price"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <p className="mt-1.5 text-xs text-muted">Required. Sales reviews lost reasons every month.</p>
      </ConfirmDialog>
    </div>
  )
}
