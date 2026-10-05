import { Button, Card, EmptyState, LazySentinel, SegmentedTabs, useLazyList } from '@rc/ui'
import { Plus, Target, Trophy, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { LeadCard } from '../../components/LeadCards'
import { ScreenHeader } from '../../layouts/ScreenHeader'
import { paths } from '../../lib/paths'
import { isOpenLead } from '../../lib/seller'
import { useReplaceParams } from '../../lib/url'
import { useNow, useSellerScope } from '../../state/scope'
import { NewLeadSheet } from './NewLeadSheet'

type LeadTab = 'open' | 'won' | 'lost'

const EMPTY: Record<
  LeadTab,
  { icon: ReactNode; title: string; description: string; next: LeadTab; nextLabel: string }
> = {
  open: {
    icon: <Target />,
    title: 'No open leads',
    description:
      'Leads from your store, WhatsApp and events land here. Log the ones you meet in person with New lead.',
    next: 'won',
    nextLabel: 'Show won deals',
  },
  won: {
    icon: <Trophy />,
    title: 'No won deals yet',
    description: 'A lead lands here once you move it to Won.',
    next: 'open',
    nextLabel: 'Show open leads',
  },
  lost: {
    icon: <XCircle />,
    title: 'Nothing lost',
    description: 'Leads you mark lost stay here with the reason, so you can learn from them.',
    next: 'open',
    nextLabel: 'Show open leads',
  },
}

export function LeadsPage() {
  const { leads, tenant } = useSellerScope()
  const now = useNow()
  const navigate = useNavigate()
  const [params, update] = useReplaceParams()
  const raw = params.get('tab')
  const tab: LeadTab = raw === 'won' || raw === 'lost' ? raw : 'open'
  const creating = params.get('new') === '1'

  const lists: Record<LeadTab, typeof leads> = {
    open: leads.filter(isOpenLead),
    won: leads.filter((l) => l.stage === 'won'),
    lost: leads.filter((l) => l.stage === 'lost'),
  }
  const items = lists[tab]
  const lazy = useLazyList(items, { resetKey: tab })

  const setTab = (value: LeadTab) => update((p) => (value === 'open' ? p.delete('tab') : p.set('tab', value)))
  const setCreating = (open: boolean) => update((p) => (open ? p.set('new', '1') : p.delete('new')))
  const empty = EMPTY[tab]

  return (
    // The extra bottom room keeps the last card clear of the floating New lead button.
    <div className="space-y-5 pb-16">
      <ScreenHeader context={`${lists.open.length} open · ${tenant.name}`} title="Leads" />

      <SegmentedTabs
        items={[
          { value: 'open', label: 'Open', count: lists.open.length },
          { value: 'won', label: 'Won', count: lists.won.length },
          { value: 'lost', label: 'Lost', count: lists.lost.length },
        ]}
        value={tab}
        onValueChange={(v) => setTab(v as LeadTab)}
        className="[&_[role=tab]]:h-11"
      />

      {items.length ? (
        <div className="space-y-3">
          {lazy.visible.map((lead) => (
            <LeadCard key={lead.id} lead={lead} now={now} />
          ))}
          <LazySentinel remaining={lazy.remaining} onLoad={lazy.loadMore} sentinelRef={lazy.sentinelRef} />
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={empty.icon}
            title={empty.title}
            description={empty.description}
            action={
              <Button variant="outline" className="h-11" onClick={() => setTab(empty.next)}>
                {empty.nextLabel}
              </Button>
            }
          />
        </Card>
      )}

      <div className="inset-x-0 max-w-md px-5 pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+6rem)] z-30 mx-auto flex w-full justify-end">
        <Button size="lg" className="pointer-events-auto" onClick={() => setCreating(true)}>
          <Plus />
          New lead
        </Button>
      </div>

      <NewLeadSheet
        open={creating}
        onOpenChange={setCreating}
        onCreated={(lead) => {
          // Drop ?new=1 first, so Back from the new lead lands on the list without reopening the form.
          setCreating(false)
          navigate(paths.lead(lead.id))
        }}
      />
    </div>
  )
}
