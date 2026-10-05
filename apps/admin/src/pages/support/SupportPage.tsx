import { fmtNumber, startOfWeek, toMs } from '@rc/fixtures'
import type { Ticket, TicketKind, TicketStatus } from '@rc/types'
import { TICKET_KIND_LABEL, TICKET_STATUS_LABEL } from '@rc/types'
import {
  Banner,
  Button,
  Chip,
  ChipRow,
  type Column,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  PillTabs,
  StatCard,
} from '@rc/ui'
import { CircleCheck, Inbox, Search, TimerOff, UserX } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { TicketStatusBadge } from '../../components/badges'
import { CustomerLink, PersonChip } from '../../components/links'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useNow, useScoped } from '../../state/scoped'
import { TicketSheet } from './TicketSheet'
import { TICKET_CHANNEL_LABEL, VIEWS, isLate, slaText } from './lib'

const KINDS = Object.keys(TICKET_KIND_LABEL) as TicketKind[]
type Flag = 'late' | 'unassigned' | null

const FLAG_LABEL: Record<Exclude<Flag, null>, string> = {
  late: 'Showing tickets past their SLA',
  unassigned: 'Showing tickets nobody owns yet',
}

export function SupportPage() {
  const s = useScoped()
  const now = useNow(30_000)
  const [params, setParams] = useSearchParams()
  const viewParam = params.get('view') as TicketStatus | null
  const view: TicketStatus = viewParam && VIEWS.includes(viewParam) ? viewParam : 'open'
  const ticketId = params.get('ticket')
  const [query, setQuery] = useHistoryState('query', '')
  const [kind, setKind] = useHistoryState<TicketKind | null>('kind', null)
  const [flag, setFlag] = useHistoryState<Flag>('flag', null)
  const table = useTableHistory()

  const setParam = (key: 'view' | 'ticket', value: string | null) =>
    setParams(
      (p) => {
        if (value === null) p.delete(key)
        else p.set(key, value)
        return p
      },
      { replace: true },
    )
  const setView = (next: TicketStatus) => setParam('view', next === 'open' ? null : next)

  const stats = useMemo(() => {
    const active = s.tickets.filter((t) => t.status !== 'resolved')
    const weekStart = startOfWeek(now)
    return {
      counts: Object.fromEntries(
        VIEWS.map((v) => [v, s.tickets.filter((t) => t.status === v).length]),
      ) as Record<TicketStatus, number>,
      late: active.filter((t) => isLate(t, now)).length,
      unassigned: active.filter((t) => !t.assigneeId).length,
      resolvedWeek: s.tickets.filter((t) => t.resolvedAt && toMs(t.resolvedAt) >= weekStart).length,
    }
  }, [s.tickets, now])

  const inView = useMemo(
    () =>
      s.tickets.filter((t) => {
        // The two flags cut across the open and waiting views.
        if (flag === 'late') return isLate(t, now)
        if (flag === 'unassigned') return t.status !== 'resolved' && !t.assigneeId
        return t.status === view
      }),
    [s.tickets, view, flag, now],
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return inView.filter((t) => {
      if (kind && t.kind !== kind) return false
      return !q || `${t.code} ${t.subject} ${s.customerName(t.customerId)}`.toLowerCase().includes(q)
    })
  }, [inView, kind, query, s])

  const selected = ticketId ? (s.tickets.find((t) => t.id === ticketId) ?? null) : null

  const columns: Column<Ticket>[] = [
    {
      id: 'ticket',
      header: 'Ticket',
      sortValue: (t) => t.code,
      cell: (t) => (
        <div className="min-w-0">
          <p className="text-xs font-semibold font-mono">{t.code}</p>
          <p className="text-sm truncate">{t.subject}</p>
          <div className="mt-1.5 gap-1.5 sm:hidden flex flex-wrap items-center">
            <TicketStatusBadge status={t.status} />
            <span
              className={isLate(t, now) ? 'font-semibold text-[11px] text-accent' : 'text-[11px] text-muted'}
            >
              {slaText(t, now)}
            </span>
          </div>
        </div>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      hideBelow: 'lg',
      sortValue: (t) => s.customerName(t.customerId),
      cell: (t) => <CustomerLink customerId={t.customerId} />,
    },
    {
      id: 'kind',
      header: 'Kind',
      hideBelow: 'md',
      sortValue: (t) => t.kind,
      cell: (t) => TICKET_KIND_LABEL[t.kind],
    },
    {
      id: 'channel',
      header: 'Channel',
      hideBelow: 'xl',
      sortValue: (t) => t.channel,
      cell: (t) => <span className="text-muted">{TICKET_CHANNEL_LABEL[t.channel]}</span>,
    },
    {
      id: 'assignee',
      header: 'Assignee',
      hideBelow: 'lg',
      sortValue: (t) => s.userName(t.assigneeId),
      cell: (t) => <PersonChip userId={t.assigneeId} />,
    },
    {
      id: 'sla',
      header: 'SLA due',
      hideBelow: 'sm',
      sortValue: (t) => toMs(t.slaDueAt),
      cell: (t) => (
        <span
          className={isLate(t, now) ? 'font-semibold whitespace-nowrap text-accent' : 'whitespace-nowrap'}
        >
          {slaText(t, now)}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      hideBelow: 'sm',
      sortValue: (t) => VIEWS.indexOf(t.status),
      cell: (t) => <TicketStatusBadge status={t.status} />,
    },
  ]

  const filtered = !!kind || !!query.trim() || !!flag

  return (
    <>
      <PageHeader
        title="Support"
        description="Questions, complaints, returns and refunds from WhatsApp, chat and email. Triage, assign and resolve them before the SLA runs out."
        actions={
          <Input
            variant="pill"
            type="search"
            aria-label="Search tickets"
            leftIcon={<Search />}
            placeholder="Search code, subject or customer"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 sm:w-72 sm:flex-none flex-1"
          />
        }
      />
      <div className="space-y-4">
        {ticketId && !selected && (
          <Banner
            tone="warning"
            title="Ticket not found"
            action={
              <Button variant="outline" size="sm" onClick={() => setParam('ticket', null)}>
                Show all tickets
              </Button>
            }
          >
            It may have been removed or belongs to another brand.
          </Banner>
        )}
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="Open"
            value={fmtNumber(stats.counts.open)}
            hint="Waiting for the team"
            icon={<Inbox />}
            tone="ink"
            onClick={() => {
              setFlag(null)
              setView('open')
            }}
          />
          <StatCard
            label="Past SLA"
            value={fmtNumber(stats.late)}
            hint={stats.late ? 'Answer these first' : 'Every ticket within its SLA'}
            icon={<TimerOff />}
            tone={stats.late ? 'accent' : 'success'}
            onClick={() => setFlag('late')}
          />
          <StatCard
            label="Unassigned"
            value={fmtNumber(stats.unassigned)}
            hint="Open or waiting, no owner"
            icon={<UserX />}
            tone={stats.unassigned ? 'warning' : 'default'}
            onClick={() => setFlag('unassigned')}
          />
          <StatCard
            label="Resolved this week"
            value={fmtNumber(stats.resolvedWeek)}
            hint="Since Monday"
            icon={<CircleCheck />}
            tone="success"
            onClick={() => {
              setFlag(null)
              setView('resolved')
            }}
          />
        </div>

        {flag ? (
          <Banner
            tone="info"
            title={FLAG_LABEL[flag]}
            action={
              <Button variant="outline" size="sm" onClick={() => setFlag(null)}>
                Back to {TICKET_STATUS_LABEL[view].toLowerCase()}
              </Button>
            }
          />
        ) : (
          <PillTabs
            value={view}
            onValueChange={(v) => setView(v as TicketStatus)}
            items={VIEWS.map((v) => ({ value: v, label: TICKET_STATUS_LABEL[v], count: stats.counts[v] }))}
          />
        )}

        <ChipRow className="max-w-full">
          <Chip variant="filter" active={!kind} count={inView.length} onClick={() => setKind(null)}>
            All kinds
          </Chip>
          {KINDS.map((k) => {
            const count = inView.filter((t) => t.kind === k).length
            if (!count && kind !== k) return null
            return (
              <Chip
                key={k}
                variant="filter"
                active={kind === k}
                count={count}
                onClick={() => setKind(kind === k ? null : k)}
              >
                {TICKET_KIND_LABEL[k]}
              </Chip>
            )
          })}
        </ChipRow>

        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(t) => t.id}
          onRowClick={(t) => setParam('ticket', t.id)}
          resetPageKey={`${view}|${flag}|${kind}|${query}`}
          initialSort={{ id: 'sla' }}
          rowClassName={(t) =>
            isLate(t, now) ? 'bg-accent-soft/40' : t.id === ticketId ? 'bg-surface-2' : undefined
          }
          empty={
            filtered ? (
              <EmptyState
                compact
                title="No tickets match"
                description="Clear the search and filters to see every ticket in this view."
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuery('')
                      setKind(null)
                      setFlag(null)
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : view === 'resolved' ? (
              <EmptyState
                compact
                title="Nothing resolved yet"
                description="Resolved tickets stay here for reporting."
              />
            ) : (
              <EmptyState
                compact
                title="No tickets here"
                description="New tickets arrive from WhatsApp, live chat and email as customers write in."
              />
            )
          }
          {...table}
        />
      </div>
      <TicketSheet ticket={selected} now={now} onClose={() => setParam('ticket', null)} />
    </>
  )
}
