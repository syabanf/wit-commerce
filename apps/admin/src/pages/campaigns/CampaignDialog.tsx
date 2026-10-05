import { DAY, fromInput, nextCode, newId, nowMs, toDateInput, toIso, toMs } from '@rc/fixtures'
import { MESSAGE_CHANNEL_LABEL, type Campaign, type MessageChannel } from '@rc/types'
import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  Textarea,
} from '@rc/ui'
import { type FormEvent, useState } from 'react'
import { PagePicker, PromotionPicker, SegmentPicker } from '../../components/pickers'
import { useScoped } from '../../state/scoped'
import { emptyFunnel } from './lib'

const CHANNELS = Object.keys(MESSAGE_CHANNEL_LABEL) as MessageChannel[]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null creates a draft. */
  editing: Campaign | null
  onSaved: (campaign: Campaign, created: boolean) => void
}

export function CampaignDialog({ open, onOpenChange, editing, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {open && (
          <CampaignForm
            editing={editing}
            onDone={(campaign) => {
              onOpenChange(false)
              if (campaign) onSaved(campaign, !editing)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CampaignForm({
  editing,
  onDone,
}: {
  editing: Campaign | null
  onDone: (campaign: Campaign | null) => void
}) {
  const s = useScoped()
  const [draft, setDraft] = useState(() => {
    const start = editing ? toMs(editing.startAt) : nowMs() + DAY
    return {
      name: editing?.name ?? '',
      goal: editing?.goal ?? '',
      channels: editing?.channels ?? (['email'] as MessageChannel[]),
      segmentId: editing?.segmentId ?? null,
      promotionId: editing?.promotionId ?? null,
      pageId: editing?.pageId ?? null,
      start: toDateInput(toIso(start)),
      end: toDateInput(editing?.endAt ?? toIso(start + 14 * DAY)),
      budget: String(editing?.budget ?? ''),
    }
  })
  const [tried, setTried] = useState(false)
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }))
  const toggleChannel = (ch: MessageChannel) =>
    set({
      channels: draft.channels.includes(ch)
        ? draft.channels.filter((c) => c !== ch)
        : [...draft.channels, ch],
    })

  const budget = Number(draft.budget || 0)
  const errors = {
    name: draft.name.trim() ? undefined : 'Enter a campaign name.',
    start: draft.start ? undefined : 'Choose the start date.',
    end: !draft.end
      ? 'Choose the end date.'
      : draft.start && draft.end < draft.start
        ? 'Choose an end date on or after the start date.'
        : undefined,
    budget:
      Number.isFinite(budget) && budget >= 0 ? undefined : 'Enter the budget in rupiah, or leave it empty.',
  }
  const show = (error: string | undefined) => (tried ? error : undefined)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (Object.values(errors).some(Boolean)) return
    const base: Campaign = editing ?? {
      id: newId('cmp'),
      tenantId: s.tenantId,
      code: nextCode(
        s.campaigns.map((c) => c.code),
        'CMP-',
        3,
      ),
      name: '',
      goal: '',
      status: 'draft',
      channels: [],
      segmentId: null,
      promotionId: null,
      pageId: null,
      startAt: '',
      endAt: '',
      budget: 0,
      funnel: emptyFunnel(),
      revenue: 0,
      createdBy: s.user.id,
    }
    const campaign: Campaign = {
      ...base,
      name: draft.name.trim(),
      goal: draft.goal.trim(),
      channels: CHANNELS.filter((c) => draft.channels.includes(c)),
      segmentId: draft.segmentId,
      promotionId: draft.promotionId,
      pageId: draft.pageId,
      startAt: fromInput(`${draft.start}T09:00`),
      endAt: fromInput(`${draft.end}T23:59`),
      budget,
    }
    s.dispatch({ type: 'campaigns/save', campaign })
    onDone(campaign)
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${editing.code}` : 'New campaign'}</DialogTitle>
        <DialogDescription>
          {editing
            ? 'Changes apply to the next message the campaign sends.'
            : 'The campaign starts as a draft. Launch it from its page when the audience and offer are ready.'}
        </DialogDescription>
      </DialogHeader>

      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        <FormField
          label="Name"
          required
          htmlFor="cmp-name"
          error={show(errors.name)}
          className="sm:col-span-2"
        >
          <Input
            id="cmp-name"
            autoFocus
            value={draft.name}
            placeholder="Running Month"
            onChange={(e) => set({ name: e.target.value })}
          />
        </FormField>
        <FormField
          label="Goal"
          htmlFor="cmp-goal"
          hint="One sentence your team can measure the campaign against."
          className="sm:col-span-2"
        >
          <Textarea
            id="cmp-goal"
            className="min-h-20"
            value={draft.goal}
            placeholder="Lift running shoe sales during October race season."
            onChange={(e) => set({ goal: e.target.value })}
          />
        </FormField>
        <FormField label="Channels" hint="Launch needs at least one channel." className="sm:col-span-2">
          <div role="group" aria-label="Channels" className="gap-2 flex flex-wrap">
            {CHANNELS.map((ch) => (
              <Chip key={ch} active={draft.channels.includes(ch)} onClick={() => toggleChannel(ch)}>
                {MESSAGE_CHANNEL_LABEL[ch]}
              </Chip>
            ))}
          </div>
        </FormField>
        <FormField
          label="Audience segment"
          htmlFor="cmp-segment"
          hint="Launch needs a segment with at least one customer."
        >
          <SegmentPicker
            id="cmp-segment"
            clearable
            value={draft.segmentId}
            onChange={(segmentId) => set({ segmentId })}
          />
        </FormField>
        <FormField label="Promotion" htmlFor="cmp-promo" hint="Optional. The voucher customers get.">
          <PromotionPicker
            id="cmp-promo"
            clearable
            placeholder="No promotion"
            value={draft.promotionId}
            onChange={(promotionId) => set({ promotionId })}
          />
        </FormField>
        <FormField label="Landing page" htmlFor="cmp-page" hint="Optional. Where the message links to.">
          <PagePicker
            id="cmp-page"
            clearable
            placeholder="No landing page"
            value={draft.pageId}
            onChange={(pageId) => set({ pageId })}
          />
        </FormField>
        <FormField label="Budget (Rp)" htmlFor="cmp-budget" error={show(errors.budget)} hint="Used for ROI.">
          <Input
            id="cmp-budget"
            inputMode="numeric"
            inputClassName="tabular-nums"
            value={draft.budget}
            placeholder="15000000"
            onChange={(e) => set({ budget: e.target.value.replace(/[^\d]/g, '') })}
          />
        </FormField>
        <FormField label="Start date" required htmlFor="cmp-start" error={show(errors.start)}>
          <Input
            id="cmp-start"
            type="date"
            value={draft.start}
            onChange={(e) => set({ start: e.target.value })}
          />
        </FormField>
        <FormField label="End date" required htmlFor="cmp-end" error={show(errors.end)}>
          <Input id="cmp-end" type="date" value={draft.end} onChange={(e) => set({ end: e.target.value })} />
        </FormField>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save changes' : 'Create draft'}</Button>
      </DialogFooter>
    </form>
  )
}
