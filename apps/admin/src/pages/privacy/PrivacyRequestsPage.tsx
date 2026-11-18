import { ApiError } from '@rc/api'
import { HOUR, fmtAgo, fmtWhen, toMs } from '@rc/fixtures'
import type { PrivacyRequest } from '@rc/types'
import { PRIVACY_REQUEST_KIND_LABEL } from '@rc/types'
import {
  Badge,
  Banner,
  Button,
  Chip,
  ChipRow,
  type Column,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FormField,
  PageHeader,
  StatCard,
  Textarea,
  toast,
} from '@rc/ui'
import { AlarmClock, CircleCheck, Download, Hourglass, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { CustomerLink } from '../../components/links'
import { HTTP, api } from '../../lib/api'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useNow, useScoped } from '../../state/scoped'
import { deadlineTone, downloadCustomerData } from './lib'

type Filter = 'open' | 'completed'

const ANSWER: Record<PrivacyRequest['kind'], string> = {
  access:
    'Download the data, send it to the shopper, then mark the request done. The shopper can also download it from their account once it is done.',
  correction: 'Fix the customer record first, then mark the request done.',
  erasure:
    "Completing it replaces the customer's name, email, phone, city and notes with placeholders everywhere, ends their account and email links, and keeps order amounts for the 10-year retention duty. This cannot be undone.",
  withdraw_consent: 'Completing it stops marketing messages to this customer at once.',
}

/** Shoppers' requests about their personal data, answered within 3x24 hours (UU PDP). */
export function PrivacyRequestsPage() {
  const s = useScoped()
  const now = useNow(60_000)
  const table = useTableHistory()
  const [status, setStatus] = useHistoryState<Filter>('status', 'open')
  const [rows, setRows] = useState<PrivacyRequest[] | null>(null)
  const [error, setError] = useState('')
  const [answering, setAnswering] = useState<PrivacyRequest | null>(null)

  const load = useCallback(() => {
    if (!HTTP) return
    api.privacy
      .requests(s.tenant.id)
      .then((r) => {
        setRows(r.requests)
        setError('')
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'The server did not answer.'))
  }, [s.tenant.id])
  useEffect(load, [load])

  const all = rows ?? []
  const open = all.filter((r) => r.status === 'open')
  const overdue = open.filter((r) => toMs(r.dueAt) < now).length
  const dueSoon = open.filter((r) => toMs(r.dueAt) >= now && toMs(r.dueAt) - now < 24 * HOUR).length
  const shown = all.filter((r) => r.status === status)

  const columns: Column<PrivacyRequest>[] = [
    { id: 'customer', header: 'Customer', cell: (r) => <CustomerLink customerId={r.customerId} /> },
    {
      id: 'kind',
      header: 'Request',
      sortValue: (r) => r.kind,
      cell: (r) => (
        <div className="min-w-0">
          <p className="text-sm font-medium">{PRIVACY_REQUEST_KIND_LABEL[r.kind]}</p>
          {r.note && <p className="mt-0.5 text-xs truncate text-muted">{r.note}</p>}
        </div>
      ),
    },
    {
      id: 'requested',
      header: 'Asked',
      hideBelow: 'md',
      sortValue: (r) => r.requestedAt,
      cell: (r) => <span className="text-xs text-muted tabular-nums">{fmtWhen(r.requestedAt, now)}</span>,
    },
    {
      id: 'due',
      header: status === 'open' ? 'Answer by' : 'Answered',
      sortValue: (r) => (status === 'open' ? r.dueAt : (r.completedAt ?? '')),
      cell: (r) => {
        if (r.status !== 'open')
          return (
            <span className="text-xs text-muted tabular-nums">{fmtWhen(r.completedAt ?? r.dueAt, now)}</span>
          )
        const tone = deadlineTone(r, now)
        return (
          <div className="gap-1 flex flex-col items-start">
            <span className="text-xs tabular-nums">{fmtWhen(r.dueAt, now)}</span>
            {tone !== 'default' && (
              <Badge variant={tone}>
                {tone === 'danger' ? `Overdue ${fmtAgo(r.dueAt, now)}` : 'Due today'}
              </Badge>
            )}
          </div>
        )
      },
    },
    {
      id: 'action',
      header: '',
      align: 'right',
      cell: (r) =>
        r.status === 'open' ? (
          <Button
            size="sm"
            variant={r.kind === 'erasure' ? 'outline' : 'primary'}
            onClick={() => setAnswering(r)}
          >
            {r.kind === 'erasure' ? 'Erase' : 'Mark done'}
          </Button>
        ) : (
          <Badge variant="success">Done</Badge>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Privacy requests"
        description="Answer shoppers who ask for a copy, a correction or the erasure of their data within 3x24 hours."
      />
      <div className="space-y-4">
        {!HTTP && (
          <Banner tone="info" title="Kept by the API">
            Privacy requests live on the server. Run the console with the API to see and answer them.
          </Banner>
        )}
        {error && (
          <Banner tone="danger" title="Requests did not load">
            {error}
          </Banner>
        )}
        <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
          <StatCard
            label="Open"
            value={open.length}
            hint="Waiting for an answer"
            icon={<ShieldCheck />}
            tone="ink"
            onClick={() => setStatus('open')}
          />
          <StatCard
            label="Overdue"
            value={overdue}
            hint="Past 3x24 hours"
            icon={<AlarmClock />}
            tone={overdue ? 'danger' : 'default'}
            onClick={() => setStatus('open')}
          />
          <StatCard
            label="Due today"
            value={dueSoon}
            hint="Under 24 hours left"
            icon={<Hourglass />}
            tone={dueSoon ? 'warning' : 'default'}
            onClick={() => setStatus('open')}
          />
          <StatCard
            label="Answered"
            value={all.length - open.length}
            hint="Kept as proof"
            icon={<CircleCheck />}
            tone="success"
            onClick={() => setStatus('completed')}
          />
        </div>
        <ChipRow aria-label="Filter privacy requests">
          <Chip
            variant="filter"
            active={status === 'open'}
            count={open.length}
            onClick={() => setStatus('open')}
          >
            Open
          </Chip>
          <Chip
            variant="filter"
            active={status === 'completed'}
            count={all.length - open.length}
            onClick={() => setStatus('completed')}
          >
            Answered
          </Chip>
        </ChipRow>
        <DataTable
          columns={columns}
          rows={shown}
          getRowKey={(r) => r.id}
          resetPageKey={status}
          initialSort={{ id: 'due', desc: status !== 'open' }}
          empty={
            HTTP && !rows && !error ? (
              <EmptyState compact title="Loading requests" description="Reading the list from the server." />
            ) : (
              <EmptyState
                compact
                title={status === 'open' ? 'No open requests' : 'No answered requests yet'}
                description="Shoppers ask from their account page. Each request shows here with its deadline."
              />
            )
          }
          {...table}
        />
      </div>
      {answering && (
        <AnswerDialog
          request={answering}
          onClose={() => setAnswering(null)}
          onDone={() => {
            setAnswering(null)
            load()
          }}
        />
      )}
    </>
  )
}

function AnswerDialog({
  request,
  onClose,
  onDone,
}: {
  request: PrivacyRequest
  onClose: () => void
  onDone: () => void
}) {
  const s = useScoped()
  const [note, setNote] = useState('')
  const customer = s.customer(request.customerId)
  const code = customer?.code ?? request.customerId
  const erasure = request.kind === 'erasure'

  // The answer's delta reaches this console through the event stream, like every other change.
  const complete = () => {
    api.privacy
      .complete(request.id, note.trim())
      .then(() => {
        toast(erasure ? 'Customer data erased' : 'Request answered', {
          tone: 'success',
          description: `${code} · ${PRIVACY_REQUEST_KIND_LABEL[request.kind]}`,
        })
        onDone()
      })
      .catch((err: unknown) => {
        toast('The request is still open', {
          tone: 'danger',
          description: err instanceof ApiError ? err.message : 'The server did not answer. Try again.',
        })
      })
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={
        erasure
          ? `Erase ${customer?.name ?? code}'s personal data?`
          : `Answer ${PRIVACY_REQUEST_KIND_LABEL[request.kind].toLowerCase()} request?`
      }
      description={ANSWER[request.kind]}
      destructive={erasure}
      confirmLabel={erasure ? 'Erase personal data' : 'Mark done'}
      onConfirm={complete}
    >
      <div className="space-y-3">
        {request.kind === 'access' && (
          <Button variant="outline" onClick={() => void downloadCustomerData(request.customerId, code)}>
            <Download />
            Download data
          </Button>
        )}
        <FormField label="Note" htmlFor="privacy-note" hint="Kept with the request as proof of the answer.">
          <Textarea
            id="privacy-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="How you answered, such as the email you sent"
          />
        </FormField>
      </div>
    </ConfirmDialog>
  )
}
