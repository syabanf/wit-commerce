import { fmtIdrShort, fmtNumber, fmtPercent, plural } from '@rc/fixtures'
import { AUTOMATION_STATUS_LABEL, AUTOMATION_TRIGGER_LABEL, type Automation } from '@rc/types'
import {
  Button,
  Chip,
  ChipRow,
  type Column,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  StatCard,
  Switch,
  toast,
} from '@rc/ui'
import { CirclePause, Search, UsersRound, Wallet, Workflow } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/auth'
import { AutomationStatusBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useScoped } from '../../state/scoped'
import { conversion } from './lib'

type Filter = 'active' | 'off' | null
const isOn = (a: Automation) => a.status === 'active'

export function AutomationsPage() {
  const s = useScoped()
  const { can } = useAuth()
  const canManage = can('automation.manage')
  const navigate = useNavigate()
  const [query, setQuery] = useHistoryState('query', '')
  const [filter, setFilter] = useHistoryState<Filter>('filter', null)
  const table = useTableHistory()

  const stats = useMemo(() => {
    const active = s.automations.filter(isOn)
    return {
      active: active.length,
      off: s.automations.length - active.length,
      enrolled: s.automations.reduce((n, a) => n + a.enrolled30d, 0),
      converted: s.automations.reduce((n, a) => n + a.converted30d, 0),
      revenue: s.automations.reduce((n, a) => n + a.revenue30d, 0),
    }
  }, [s.automations])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return s.automations.filter((a) => {
      if (filter === 'active' && !isOn(a)) return false
      if (filter === 'off' && isOn(a)) return false
      return (
        !q ||
        `${a.name} ${a.description} ${AUTOMATION_TRIGGER_LABEL[a.trigger]} ${a.triggerDetail}`
          .toLowerCase()
          .includes(q)
      )
    })
  }, [s.automations, query, filter])

  const setStatus = (a: Automation, on: boolean) => {
    s.dispatch({ type: 'automations/setStatus', id: a.id, status: on ? 'active' : 'paused' })
    toast(on ? 'Automation activated' : 'Automation paused', {
      tone: on ? 'success' : 'default',
      description: on
        ? `${a.name} · enrols customers from now on.`
        : `${a.name} · customers already in the journey stop at their next step.`,
    })
  }

  const columns: Column<Automation>[] = [
    {
      id: 'name',
      header: 'Automation',
      sortValue: (a) => a.name,
      cell: (a) => (
        <div className="min-w-0">
          <p className="font-medium truncate">{a.name}</p>
          <p className="text-xs truncate text-muted">{a.description}</p>
          <p className="mt-1 md:hidden text-[0.6875rem] text-muted">{AUTOMATION_TRIGGER_LABEL[a.trigger]}</p>
        </div>
      ),
    },
    {
      id: 'trigger',
      header: 'Trigger',
      hideBelow: 'md',
      sortValue: (a) => AUTOMATION_TRIGGER_LABEL[a.trigger],
      cell: (a) => (
        <div className="min-w-0">
          <p className="truncate">{AUTOMATION_TRIGGER_LABEL[a.trigger]}</p>
          <p className="truncate text-[0.6875rem] text-muted">{a.triggerDetail}</p>
        </div>
      ),
    },
    {
      id: 'steps',
      header: 'Steps',
      align: 'right',
      hideBelow: 'xl',
      sortValue: (a) => a.steps.length,
      cell: (a) => <span className="tabular-nums">{a.steps.length}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      sortValue: (a) => a.status,
      cell: (a) => {
        if (!canManage) return <AutomationStatusBadge status={a.status} />
        if (a.status === 'draft') {
          return (
            <Button
              variant="outline"
              size="sm"
              disabled={!a.steps.length}
              title={a.steps.length ? undefined : 'Add a step before activating.'}
              onClick={() => setStatus(a, true)}
            >
              Activate
            </Button>
          )
        }
        return (
          <span className="gap-2 inline-flex items-center">
            <Switch
              size="sm"
              checked={isOn(a)}
              onCheckedChange={(on) => setStatus(a, on)}
              aria-label={`${a.name}: ${isOn(a) ? 'pause' : 'activate'}`}
            />
            <span className="text-xs text-muted">{AUTOMATION_STATUS_LABEL[a.status]}</span>
          </span>
        )
      },
    },
    {
      id: 'enrolled',
      header: 'Enrolled 30d',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (a) => a.enrolled30d,
      cell: (a) => <span className="tabular-nums">{fmtNumber(a.enrolled30d)}</span>,
    },
    {
      id: 'converted',
      header: 'Converted',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (a) => a.converted30d,
      cell: (a) => <span className="tabular-nums">{fmtNumber(a.converted30d)}</span>,
    },
    {
      id: 'conversion',
      header: 'Conversion',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (a) => conversion(a),
      cell: (a) => <span className="tabular-nums">{fmtPercent(conversion(a), 1)}</span>,
    },
    {
      id: 'revenue',
      header: 'Revenue 30d',
      align: 'right',
      sortValue: (a) => a.revenue30d,
      cell: (a) => (
        <span className="font-semibold whitespace-nowrap tabular-nums">{fmtIdrShort(a.revenue30d)}</span>
      ),
    },
  ]

  const clear = () => {
    setQuery('')
    setFilter(null)
  }

  return (
    <>
      <PageHeader
        title="Automations"
        description="Journeys that run on their own: a trigger enrols the customer, then waits, checks and messages move them toward a purchase."
        actions={
          <Input
            variant="pill"
            type="search"
            aria-label="Search automations"
            leftIcon={<Search />}
            placeholder="Search name or trigger"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 sm:w-72 sm:flex-none flex-1"
          />
        }
      />
      <div className="space-y-4">
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="Active"
            value={stats.active}
            unit={`of ${s.automations.length}`}
            hint="Enrolling customers now"
            icon={<Workflow />}
            tone="success"
            onClick={() => setFilter('active')}
          />
          <StatCard
            label="Customers enrolled in 30 days"
            value={fmtNumber(stats.enrolled)}
            hint={`${plural(stats.converted, 'purchase')} after enrolling`}
            icon={<UsersRound />}
            tone="info"
            onClick={clear}
          />
          <StatCard
            label="Revenue in 30 days"
            value={fmtIdrShort(stats.revenue)}
            hint="Orders placed inside a journey"
            icon={<Wallet />}
            tone="ink"
            onClick={clear}
          />
          <StatCard
            label="Paused or draft"
            value={stats.off}
            hint={stats.off ? 'Not enrolling anyone' : 'Every journey is running'}
            icon={<CirclePause />}
            tone={stats.off ? 'warning' : 'default'}
            onClick={() => setFilter('off')}
          />
        </div>
        <ChipRow className="max-w-full">
          <Chip
            variant="filter"
            active={!filter}
            count={s.automations.length}
            onClick={() => setFilter(null)}
          >
            All
          </Chip>
          <Chip
            variant="filter"
            active={filter === 'active'}
            count={stats.active}
            onClick={() => setFilter(filter === 'active' ? null : 'active')}
          >
            Active
          </Chip>
          <Chip
            variant="filter"
            active={filter === 'off'}
            count={stats.off}
            onClick={() => setFilter(filter === 'off' ? null : 'off')}
          >
            Paused or draft
          </Chip>
        </ChipRow>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(a) => a.id}
          onRowClick={(a) => navigate(paths.automation(a.id))}
          resetPageKey={`${query}|${filter}`}
          initialSort={{ id: 'revenue', desc: true }}
          empty={
            filter || query.trim() ? (
              <EmptyState
                compact
                title="No automations match"
                description="Clear the search and filters to see every automation."
                action={
                  <Button variant="outline" size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                title="No automations yet"
                description="Journeys such as the welcome series and cart reminders appear here once they are set up."
              />
            )
          }
          {...table}
        />
      </div>
    </>
  )
}
