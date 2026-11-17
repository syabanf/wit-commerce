import { fmtAgo, fmtIdrShort } from '@rc/fixtures'
import type { Lead, Ticket } from '@rc/types'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  type Column,
  DataTable,
  EmptyState,
  PageHeader,
} from '@rc/ui'
import { Handshake, Headset } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { LeadStageBadge, TicketStatusBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { mayOpen } from '../../layouts/nav'
import { useTableHistory } from '../../lib/history-state'
import { useNow, useScoped } from '../../state/scoped'
import { isLate, slaText } from '../support/lib'
import { myWork } from './lib'

/** The tickets assigned to the signed-in person and, for a seller, the leads waiting on them. */
export function MyTasksPage() {
  const s = useScoped()
  const now = useNow(30_000)
  const navigate = useNavigate()
  const work = useMemo(() => myWork(s), [s])
  const ticketTable = useTableHistory('tickets')
  const leadTable = useTableHistory('leads')
  // A role without the Support or Leads page reads these rows here and opens nothing.
  const opensTickets = mayOpen(s.user.role, '/customers/support')
  const opensLeads = mayOpen(s.user.role, '/customers/leads')

  const ticketColumns: Column<Ticket>[] = [
    {
      id: 'ticket',
      header: 'Ticket',
      cell: (t) => (
        <div className="min-w-0">
          <p className="text-xs font-semibold font-mono">{t.code}</p>
          <p className="text-sm truncate">{t.subject}</p>
        </div>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      hideBelow: 'md',
      cell: (t) => s.customerName(t.customerId),
    },
    { id: 'status', header: 'Status', cell: (t) => <TicketStatusBadge status={t.status} /> },
    {
      id: 'sla',
      header: 'Answer by',
      hideBelow: 'sm',
      cell: (t) => (
        <span className={isLate(t, now) ? 'font-semibold text-accent' : 'text-muted'}>{slaText(t, now)}</span>
      ),
    },
  ]

  const leadColumns: Column<Lead>[] = [
    {
      id: 'lead',
      header: 'Lead',
      cell: (l) => (
        <div className="min-w-0">
          <p className="text-xs font-semibold font-mono">{l.code}</p>
          <p className="text-sm truncate">{l.company || l.name}</p>
        </div>
      ),
    },
    { id: 'stage', header: 'Stage', cell: (l) => <LeadStageBadge stage={l.stage} /> },
    { id: 'value', header: 'Value', align: 'right', hideBelow: 'sm', cell: (l) => fmtIdrShort(l.value) },
    {
      id: 'touched',
      header: 'Last touched',
      hideBelow: 'md',
      cell: (l) => <span className="text-muted">{fmtAgo(l.updatedAt, now)}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        title="My tasks"
        description={`Work assigned to you at ${s.tenant.name}, the open items first.`}
      />
      <Card>
        <CardHeader>
          <CardTitle>Tickets assigned to me</CardTitle>
          <CardDescription>
            {opensTickets
              ? 'Open a ticket to answer it.'
              : 'Your role reads these here. Someone in customer service answers them.'}
          </CardDescription>
        </CardHeader>
        <DataTable
          columns={ticketColumns}
          rows={work.tickets}
          getRowKey={(t) => t.id}
          onRowClick={opensTickets ? (t) => navigate(paths.ticket(t.id)) : undefined}
          pageSize={10}
          empty={
            <EmptyState
              compact
              icon={<Headset />}
              title="No tickets assigned to you"
              description="A support ticket appears here when someone assigns it to you."
            />
          }
          {...ticketTable}
        />
      </Card>

      {work.seller && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>My leads needing action</CardTitle>
            <CardDescription>Open leads on your seller profile, the longest untouched first.</CardDescription>
          </CardHeader>
          <DataTable
            columns={leadColumns}
            rows={work.leads}
            getRowKey={(l) => l.id}
            onRowClick={opensLeads ? (l) => navigate(paths.lead(l.id)) : undefined}
            pageSize={10}
            empty={
              <EmptyState
                compact
                icon={<Handshake />}
                title="No leads waiting on you"
                description="Enquiries from your personal store and leads assigned to you appear here."
              />
            }
            {...leadTable}
          />
        </Card>
      )}
    </>
  )
}
