import { startOfDay } from '@rc/fixtures'
import { Card, EmptyState, PageHeader, PillTabs, UnderlineTabs } from '@rc/ui'
import { ChartColumn } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { useHistoryState } from '../../lib/history-state'
import { useNow } from '../../state/scoped'
import { CampaignTab } from './CampaignTab'
import { CommerceTab } from './CommerceTab'
import { CustomerTab } from './CustomerTab'
import { ProductTab } from './ProductTab'
import { SalesTab } from './SalesTab'
import { type AnalyticsTab, TABS, WINDOWS, type WindowDays, isTab } from './lib'

const TAB_VIEW: Record<AnalyticsTab, typeof CommerceTab> = {
  commerce: CommerceTab,
  customer: CustomerTab,
  product: ProductTab,
  campaign: CampaignTab,
  sales: SalesTab,
}

export function AnalyticsPage() {
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const [days, setDays] = useHistoryState<WindowDays>('window', 30)
  // Derivations recompute once per day, not on every clock tick.
  const today = startOfDay(useNow(60_000))
  const raw = params.get('tab')
  const tab: AnalyticsTab = isTab(raw) ? raw : 'commerce'

  const setTab = (next: string) =>
    setParams(
      (p) => {
        if (next === 'commerce') p.delete('tab')
        else p.set('tab', next)
        return p
      },
      { replace: true },
    )

  if (!can('analytics.view')) {
    return (
      <>
        <PageHeader
          title="Analytics"
          description="Sales, customer, product and campaign numbers for this brand."
        />
        <Card>
          <EmptyState
            icon={<ChartColumn />}
            title="Analytics is not part of your role"
            description="Admins, marketing and commerce operations can open analytics. Ask a tenant admin if you need the numbers."
          />
        </Card>
      </>
    )
  }

  const View = TAB_VIEW[tab]
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Revenue, customers, products, campaigns and sellers over the window you pick, compared with the window before."
        actions={
          <PillTabs
            size="sm"
            items={WINDOWS.map((w) => ({ value: String(w), label: `${w} days` }))}
            value={String(days)}
            onValueChange={(v) => setDays(WINDOWS.find((w) => String(w) === v) ?? 30)}
          />
        }
      />
      <div className="space-y-4">
        <UnderlineTabs items={TABS} value={tab} onValueChange={setTab} />
        <View days={days} today={today} />
      </div>
    </>
  )
}
