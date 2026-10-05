import { fmtTime } from '@rc/fixtures'
import { PillTabs } from '@rc/ui'
import { useMemo } from 'react'
import { usePersistentState } from '../../lib/storage'
import { useNow, useScoped } from '../../state/scoped'
import { GrowthView } from './GrowthView'
import { OverviewView } from './OverviewView'
import { RoleHome } from './RoleHome'
import { attentionQueues } from './lib'

type View = 'overview' | 'growth'

export function DashboardPage() {
  const s = useScoped()
  const now = useNow(60_000)
  const [view, setView] = usePersistentState<View>('rc.admin.dashboard.view', 'overview')
  const queues = useMemo(() => attentionQueues(s, now), [s, now])

  if (s.user.role === 'sales' || s.user.role === 'service') return <RoleHome s={s} now={now} />

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Home</h1>
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <PillTabs
          value={view}
          onValueChange={(v) => setView(v as View)}
          items={[
            { value: 'overview', label: 'Commerce overview' },
            { value: 'growth', label: 'Growth' },
          ]}
        />
        <p className="text-xs md:block hidden text-muted">
          {s.tenant.name} · updated {fmtTime(now)}
        </p>
      </div>
      {view === 'overview' ? (
        <OverviewView s={s} now={now} queues={queues} />
      ) : (
        <GrowthView s={s} now={now} />
      )}
    </div>
  )
}
