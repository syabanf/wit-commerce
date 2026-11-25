import { ApiError, type PlatformHoliday } from '@rc/api'
import { dayKey, fmtDate, isCalendarDate, nowMs, toMs } from '@rc/fixtures'
import type { PublicHoliday } from '@rc/types'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  NativeSelect,
  PageHeader,
  Switch,
  cn,
  toast,
} from '@rc/ui'
import { Pencil, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useAuth } from '../../auth/auth'
import { HTTP, api } from '../../lib/api'
import { usePublicHolidays } from '../../lib/holidays'

const KIND_LABEL: Record<PublicHoliday['kind'], string> = {
  national: 'National holiday',
  cuti_bersama: 'Cuti bersama',
}
const KIND_OPTIONS = Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))

const message = (err: unknown) => (err instanceof ApiError ? err.message : 'The server did not answer.')
const dateLabel = (date: string) => fmtDate(toMs(`${date}T00:00:00+07:00`))
const weekday = (date: string) =>
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    new Date(`${date}T00:00:00Z`).getUTCDay()
  ]
const cellClass = 'px-5 py-3 border-b border-border text-left'

const EMPTY: PublicHoliday = { date: '', name: '', kind: 'national', confirmed: true }

/** National holidays and cuti bersama that working-day deadlines skip on every store. */
export function HolidaysPage() {
  const { user } = useAuth()
  const platform = user?.role === 'platform_admin'
  const editable = HTTP && platform
  const { holidays, set, error, load } = usePublicHolidays()
  const [draft, setDraft] = useState<PublicHoliday>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [year, setYear] = useState(() => dayKey(nowMs()).slice(0, 4))
  const years = [...new Set((holidays ?? []).map((h) => h.date.slice(0, 4)))].sort()
  const shown = (holidays ?? []).filter((h) => h.date.startsWith(year))
  const unconfirmed = (holidays ?? []).filter((h) => !h.confirmed).length

  const blocker = !isCalendarDate(draft.date)
    ? 'Pick a date.'
    : !draft.name.trim()
      ? 'Name the holiday.'
      : null

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (blocker) return
    setSaving(true)
    try {
      const { date, ...input } = draft
      const next = await api.holidays.save(date, { ...input, name: input.name.trim() })
      set(next.holidays)
      setYear(date.slice(0, 4))
      setDraft(EMPTY)
      toast('Holiday saved', { tone: 'success', description: `${dateLabel(date)}: ${input.name.trim()}` })
    } catch (err) {
      toast('Not saved', { tone: 'danger', description: message(err) })
    }
    setSaving(false)
  }
  const remove = async (h: PlatformHoliday) => {
    try {
      const next = await api.holidays.remove(h.date)
      set(next.holidays)
      toast('Holiday removed', { tone: 'success', description: `${dateLabel(h.date)}: ${h.name}` })
    } catch (err) {
      toast('Not removed', { tone: 'danger', description: message(err) })
    }
  }

  return (
    <>
      <PageHeader
        title="Public holidays"
        description="National holidays and cuti bersama from the SKB 3 Menteri. Every store's 2-working-day return floor and complaint due times skip them."
      />
      <div className="space-y-4">
        {!HTTP && (
          <Banner tone="warning" title="This console runs without the API">
            The list below is the built-in one the demo counts. Build the console with VITE_API_URL to change
            it.
          </Banner>
        )}
        {HTTP && !platform && (
          <Banner tone="neutral" title="Ask a platform admin">
            Only a platform admin can change public holidays. Brands add their own closed days under Legal &
            policies.
          </Banner>
        )}
        {error && (
          <Banner
            tone="danger"
            title="Could not load the holidays"
            action={
              <Button variant="outline" size="sm" onClick={load}>
                Try again
              </Button>
            }
          >
            {error}
          </Banner>
        )}
        {unconfirmed > 0 && (
          <Banner tone="warning" title={`${unconfirmed} dates need confirmation`}>
            Check them against the official SKB 3 Menteri text, then switch on Confirmed. Until then they
            still count as holidays.
          </Banner>
        )}

        {editable && (
          <Card>
            <CardHeader>
              <CardTitle>
                {draft.date && holidays?.some((h) => h.date === draft.date)
                  ? 'Change a holiday'
                  : 'Add a holiday'}
              </CardTitle>
              <CardDescription>Saving a date that is already listed replaces it.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="gap-3 md:grid-cols-[10rem_minmax(0,1fr)_12rem_auto_auto] md:items-end grid grid-cols-1"
                onSubmit={save}
              >
                <FormField label="Date">
                  <Input
                    type="date"
                    variant="soft"
                    value={draft.date}
                    onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                  />
                </FormField>
                <FormField label="Name">
                  <Input
                    variant="soft"
                    maxLength={120}
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  />
                </FormField>
                <FormField label="Kind">
                  <NativeSelect
                    variant="soft"
                    options={KIND_OPTIONS}
                    value={draft.kind}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, kind: e.target.value as PublicHoliday['kind'] }))
                    }
                  />
                </FormField>
                <FormField label="Confirmed">
                  <div className="h-11 flex items-center">
                    <Switch
                      checked={draft.confirmed}
                      onCheckedChange={(confirmed) => setDraft((d) => ({ ...d, confirmed }))}
                    />
                  </div>
                </FormField>
                <Button type="submit" loading={saving} disabled={!!blocker}>
                  Save holiday
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="gap-2 flex flex-wrap items-center justify-between">
              <CardTitle>{year}</CardTitle>
              <div className="gap-1 flex flex-wrap" role="group" aria-label="Year">
                {years.map((y) => (
                  <Button
                    key={y}
                    size="sm"
                    variant={y === year ? 'primary' : 'outline'}
                    aria-pressed={y === year}
                    onClick={() => setYear(y)}
                  >
                    {y}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <div className="pb-2 overflow-x-auto">
            <table className="border-spacing-0 text-sm w-full border-separate">
              <caption className="sr-only">Public holidays in {year}</caption>
              <thead>
                <tr className="text-xs text-muted">
                  <th scope="col" className={cn(cellClass, 'font-semibold')}>
                    Date
                  </th>
                  <th scope="col" className={cn(cellClass, 'font-semibold')}>
                    Name
                  </th>
                  <th scope="col" className={cn(cellClass, 'font-semibold')}>
                    Kind
                  </th>
                  <th scope="col" className={cn(cellClass, 'font-semibold')}>
                    Status
                  </th>
                  {editable && (
                    <th scope="col" className={cellClass}>
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {shown.map((h) => (
                  <tr key={h.date}>
                    <td className={cn(cellClass, 'whitespace-nowrap tabular-nums')}>
                      {dateLabel(h.date)} <span className="text-muted">{weekday(h.date)}</span>
                    </td>
                    <td className={cellClass}>{h.name}</td>
                    <td className={cn(cellClass, 'whitespace-nowrap')}>{KIND_LABEL[h.kind]}</td>
                    <td className={cellClass}>
                      <Badge variant={h.confirmed ? 'success' : 'warning'}>
                        {h.confirmed ? 'Confirmed' : 'Needs confirmation'}
                      </Badge>
                    </td>
                    {editable && (
                      <td className={cn(cellClass, 'text-right whitespace-nowrap')}>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Change ${dateLabel(h.date)}`}
                          onClick={() =>
                            setDraft({ date: h.date, name: h.name, kind: h.kind, confirmed: h.confirmed })
                          }
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Remove ${dateLabel(h.date)}`}
                          onClick={() => remove(h)}
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
                {!shown.length && (
                  <tr>
                    <td colSpan={5} className={cn(cellClass, 'text-muted')}>
                      {holidays ? `No holidays listed for ${year}.` : 'Loading holidays.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  )
}
