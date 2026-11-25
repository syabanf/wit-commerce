import { closedDaysBlocker, dayKey, fmtDate, normalizeClosedDays, nowMs, plural, toMs } from '@rc/fixtures'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  toast,
} from '@rc/ui'
import { X } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../auth/auth'
import { usePublicHolidays } from '../../lib/holidays'
import { useScoped } from '../../state/scoped'

const dateLabel = (date: string) => fmtDate(toMs(`${date}T00:00:00+07:00`))

/**
 * Days the brand is closed besides weekends and public holidays. The 2-working-day return floor and
 * complaint due times skip them, so shoppers get the same number of days the brand is open.
 */
export function ClosedDaysCard() {
  const s = useScoped()
  const { can } = useAuth()
  const canManage = can('brand.manage')
  const { holidays } = usePublicHolidays()
  const saved = s.tenant.closedDays ?? []
  const [days, setDays] = useState<string[]>(saved)
  const [pick, setPick] = useState('')
  const [saving, setSaving] = useState(false)
  const today = dayKey(nowMs())
  const next = normalizeClosedDays(days)
  const blocker = closedDaysBlocker(next)
  const dirty = JSON.stringify(next) !== JSON.stringify(saved)
  const upcoming = (holidays ?? []).filter((h) => h.date >= today).slice(0, 6)

  const add = () => {
    if (!pick) return
    setDays((d) => normalizeClosedDays([...d, pick]))
    setPick('')
  }
  const save = async () => {
    setSaving(true)
    try {
      await s.dispatchAsync({ type: 'tenants/setClosedDays', tenantId: s.tenantId, closedDays: next })
      toast('Closed days saved', {
        tone: 'success',
        description: `${s.tenant.name}: return and complaint deadlines skip ${plural(next.length, 'closed day')}.`,
      })
    } catch (err) {
      toast('Not saved', { tone: 'danger', description: (err as Error).message })
    }
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Closed days</CardTitle>
        <CardDescription>
          Days your store does not work besides weekends and public holidays, such as a company retreat. The
          2-working-day return floor and complaint due times skip them, and shoppers see the later deadline.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {next.length ? (
          <ul className="gap-2 flex flex-wrap" aria-label="Closed days">
            {next.map((d) => (
              <li
                key={d}
                className="gap-1 pl-3 pr-1 py-1 text-sm flex items-center rounded-full bg-surface-2"
              >
                <span className={d < today ? 'text-muted' : undefined}>{dateLabel(d)}</span>
                {canManage && (
                  <button
                    type="button"
                    className="size-6 hover:bg-black/5 inline-flex items-center justify-center rounded-full"
                    aria-label={`Remove ${dateLabel(d)}`}
                    onClick={() => setDays((all) => all.filter((x) => x !== d))}
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            No closed days. Deadlines skip weekends and public holidays only.
          </p>
        )}
        {canManage && (
          <div className="gap-2 flex flex-wrap items-end">
            <FormField label="Add a day" className="min-w-0 sm:w-56 w-full">
              <Input
                type="date"
                variant="soft"
                value={pick}
                min={today}
                onChange={(e) => setPick(e.target.value)}
              />
            </FormField>
            <Button variant="outline" disabled={!pick} onClick={add}>
              Add
            </Button>
          </div>
        )}
        {upcoming.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted">Upcoming public holidays, already skipped</p>
            <ul className="gap-2 flex flex-wrap">
              {upcoming.map((h) => (
                <li key={h.date}>
                  <Badge variant="muted">
                    {dateLabel(h.date)} · {h.name}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
        {canManage && (
          <div className="gap-2 flex flex-wrap items-center justify-end">
            {blocker && dirty && (
              <p role="alert" className="text-sm mr-auto text-danger">
                {blocker}
              </p>
            )}
            <Button loading={saving} disabled={!dirty || !!blocker} onClick={save}>
              Save closed days
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
