import { fmtAgo, fmtDateTime, fmtIdr, fmtNumber, fmtPercent, newId, plural } from '@rc/fixtures'
import {
  AUTOMATION_STEP_LABEL,
  AUTOMATION_TRIGGER_LABEL,
  type Automation,
  type AutomationStep,
  type AutomationStepKind,
} from '@rc/types'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FormField,
  IconTile,
  Input,
  KeyValue,
  Kicker,
  StatCard,
  toast,
} from '@rc/ui'
import {
  ArrowDown,
  ArrowUp,
  Pause,
  Percent,
  Play,
  Plus,
  ShoppingBag,
  Trash2,
  UsersRound,
  Wallet,
  Zap,
} from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { AutomationStatusBadge } from '../../components/badges'
import { useNow, useScoped } from '../../state/scoped'
import { STEP_KINDS, STEP_LOOK, conversion } from './lib'

const LIST = '/marketing/automations'

export function AutomationDetailPage() {
  const { id } = useParams()
  const s = useScoped()
  const { can } = useAuth()
  const now = useNow(60_000)
  const [adding, setAdding] = useState(false)
  const automation = s.automations.find((a) => a.id === id)

  if (!automation) {
    return (
      <Card>
        <EmptyState
          title="Automation not found"
          description="It may have been removed or belongs to another brand."
          action={<BackButton fallback={LIST} />}
        />
      </Card>
    )
  }

  const canManage = can('automation.manage')
  const active = automation.status === 'active'
  const activateBlocker = automation.steps.length ? null : 'Add a step before activating.'

  const setStatus = (on: boolean) => {
    s.dispatch({ type: 'automations/setStatus', id: automation.id, status: on ? 'active' : 'paused' })
    toast(on ? 'Automation activated' : 'Automation paused', {
      tone: on ? 'success' : 'default',
      description: on
        ? `${automation.name} · enrols customers from now on.`
        : `${automation.name} · customers already in the journey stop at their next step.`,
    })
  }

  const saveSteps = (steps: AutomationStep[]) =>
    s.dispatch({ type: 'automations/save', automation: { ...automation, steps } })

  const move = (index: number, by: -1 | 1) => {
    const steps = [...automation.steps]
    const [step] = steps.splice(index, 1)
    steps.splice(index + by, 0, step!)
    saveSteps(steps)
    toast('Step moved', {
      tone: 'success',
      description: `${AUTOMATION_STEP_LABEL[step!.kind]} is now step ${index + by + 1} of ${steps.length}.`,
    })
  }

  const remove = (step: AutomationStep) => {
    const before = automation.steps
    saveSteps(before.filter((x) => x.id !== step.id))
    toast('Step removed', {
      description: `${AUTOMATION_STEP_LABEL[step.kind]} · ${step.detail}`,
      action: { label: 'Undo', onClick: () => saveSteps(before) },
    })
  }

  return (
    <div className="space-y-4">
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <BackButton fallback={LIST} />
        {canManage && (
          <div className="gap-2 flex flex-wrap items-center">
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus />
              Add step
            </Button>
            {active ? (
              <Button variant="outline" onClick={() => setStatus(false)}>
                <Pause />
                Pause
              </Button>
            ) : (
              <Button
                onClick={() => setStatus(true)}
                disabled={!!activateBlocker}
                title={activateBlocker ?? undefined}
              >
                <Play />
                Activate
              </Button>
            )}
          </div>
        )}
      </div>

      {canManage && !active && activateBlocker && (
        <Card className="p-4 text-sm">
          <span className="font-semibold">Cannot activate yet:</span> {activateBlocker}
        </Card>
      )}

      <div className="gap-3 flex flex-wrap items-start justify-between">
        <div className="min-w-0">
          <Kicker>Automation · updated {fmtAgo(automation.updatedAt, now)}</Kicker>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{automation.name}</h1>
          {automation.description && (
            <p className="mt-1 max-w-2xl text-sm text-muted">{automation.description}</p>
          )}
        </div>
        <AutomationStatusBadge status={automation.status} />
      </div>

      <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
        <StatCard
          label="Enrolled"
          value={fmtNumber(automation.enrolled30d)}
          hint="Customers in the last 30 days"
          icon={<UsersRound />}
          tone="info"
        />
        <StatCard
          label="Converted"
          value={fmtNumber(automation.converted30d)}
          hint="Bought after enrolling"
          icon={<ShoppingBag />}
          tone="success"
        />
        <StatCard
          label="Conversion"
          value={fmtPercent(conversion(automation), 1)}
          hint="Converted over enrolled"
          icon={<Percent />}
          tone="default"
        />
        <StatCard
          label="Revenue"
          value={fmtIdr(automation.revenue30d)}
          hint="Last 30 days"
          icon={<Wallet />}
          tone="ink"
        />
      </div>

      <div className="gap-4 xl:grid-cols-[minmax(0,1fr)_340px] grid grid-cols-1">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Journey</CardTitle>
            <CardDescription>
              Runs top to bottom for every customer the trigger enrols. A condition that fails ends the
              journey for that customer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="gap-3 rounded-2xl p-4 flex items-center bg-ink text-on-ink">
              <IconTile tone="accent">
                <Zap />
              </IconTile>
              <div className="min-w-0">
                <p className="font-semibold tracking-wider text-[0.6875rem] text-on-ink-muted uppercase">
                  Trigger
                </p>
                <p className="font-semibold truncate">{AUTOMATION_TRIGGER_LABEL[automation.trigger]}</p>
                <p className="text-sm truncate text-on-ink-muted">{automation.triggerDetail}</p>
              </div>
            </div>
            {automation.steps.length === 0 ? (
              <>
                <Connector />
                <EmptyState
                  compact
                  title="No steps yet"
                  description="Add a wait, a check or a message to start the journey."
                  action={
                    canManage ? (
                      <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                        <Plus />
                        Add step
                      </Button>
                    ) : undefined
                  }
                />
              </>
            ) : (
              <ol aria-label="Steps">
                {automation.steps.map((step, i) => {
                  const look = STEP_LOOK[step.kind]
                  return (
                    <li key={step.id}>
                      <Connector />
                      <div className="gap-3 rounded-2xl p-3 flex flex-wrap items-center bg-surface-2">
                        <IconTile tone={look.tone}>{look.icon}</IconTile>
                        <div className="min-w-0 basis-40 flex-1">
                          <p className="text-sm font-semibold">
                            <span className="text-muted">Step {i + 1} · </span>
                            {AUTOMATION_STEP_LABEL[step.kind]}
                          </p>
                          <p className="text-sm truncate text-muted">{step.detail}</p>
                        </div>
                        {canManage && (
                          <div className="gap-1 flex shrink-0 items-center">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Move step ${i + 1} up`}
                              disabled={i === 0}
                              onClick={() => move(i, -1)}
                            >
                              <ArrowUp />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Move step ${i + 1} down`}
                              disabled={i === automation.steps.length - 1}
                              onClick={() => move(i, 1)}
                            >
                              <ArrowDown />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove step ${i + 1}`}
                              onClick={() => remove(step)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
            {automation.steps.length > 0 && (
              <>
                <Connector />
                <p className="ml-3 px-3 py-1 text-xs font-medium inline-flex rounded-full bg-surface text-muted">
                  Journey ends
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 self-start">
          <CardHeader>
            <Kicker className="font-bold text-[0.8125rem] tracking-[0.4px] text-foreground">Details</Kicker>
          </CardHeader>
          <CardContent>
            <KeyValue
              bare
              labelWidth="sm"
              items={[
                { label: 'Trigger', value: AUTOMATION_TRIGGER_LABEL[automation.trigger] },
                { label: 'Condition', value: automation.triggerDetail || 'None' },
                { label: 'Steps', value: plural(automation.steps.length, 'step') },
                { label: 'Status', value: <AutomationStatusBadge status={automation.status} /> },
                { label: 'Updated', value: fmtDateTime(automation.updatedAt) },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      {canManage && <AddStepDialog automation={automation} open={adding} onOpenChange={setAdding} />}
    </div>
  )
}

/** The line that joins two journey cards, centred under the 42px icon tile of a padded row. */
function Connector() {
  return <div aria-hidden="true" className="h-5 ml-[2.0625rem] w-px bg-border" />
}

function AddStepDialog({
  automation,
  open,
  onOpenChange,
}: {
  automation: Automation
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <AddStepForm automation={automation} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function AddStepForm({ automation, onDone }: { automation: Automation; onDone: () => void }) {
  const { dispatch } = useScoped()
  const [kind, setKind] = useState<AutomationStepKind | null>(null)
  const [detail, setDetail] = useState('')
  const [tried, setTried] = useState(false)
  const errors = {
    kind: kind ? undefined : 'Choose what the step does.',
    detail: detail.trim()
      ? undefined
      : 'Describe the step, such as how long to wait or which message to send.',
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!kind || errors.detail) return
    const step: AutomationStep = { id: newId('step'), kind, detail: detail.trim() }
    dispatch({ type: 'automations/save', automation: { ...automation, steps: [...automation.steps, step] } })
    toast('Step added', {
      tone: 'success',
      description: `${AUTOMATION_STEP_LABEL[kind]} is step ${automation.steps.length + 1} of ${automation.name}.`,
    })
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Add step</DialogTitle>
        <DialogDescription>
          The step goes at the end of the journey. Move it up afterwards if it belongs earlier.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <FormField label="Step" required htmlFor="step-kind" error={tried ? errors.kind : undefined}>
          <Combobox
            id="step-kind"
            items={STEP_KINDS}
            value={kind}
            onChange={(v) => setKind(v as AutomationStepKind | null)}
            placeholder="Choose a step"
            searchPlaceholder="Search steps"
            getKey={(k) => k}
            getLabel={(k) => AUTOMATION_STEP_LABEL[k]}
            renderIcon={(k) => (
              <IconTile size="sm" tone={STEP_LOOK[k].tone}>
                {STEP_LOOK[k].icon}
              </IconTile>
            )}
          />
        </FormField>
        <FormField label="Detail" required htmlFor="step-detail" error={tried ? errors.detail : undefined}>
          <Input
            id="step-detail"
            value={detail}
            placeholder={kind ? STEP_LOOK[kind].placeholder : 'Pick a step first'}
            onChange={(e) => setDetail(e.target.value)}
          />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Add step</Button>
      </DialogFooter>
    </form>
  )
}
