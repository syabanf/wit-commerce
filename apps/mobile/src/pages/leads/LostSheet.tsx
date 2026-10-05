import type { Lead } from '@rc/types'
import { Button, FormField, Textarea, toast } from '@rc/ui'
import { type FormEvent, useState } from 'react'
import { ActionSheet } from '../../components/ActionSheet'
import { ChoiceGrid } from '../../components/ChoiceGrid'
import { useSellerScope } from '../../state/scope'

const REASONS = [
  'Price too high',
  'Bought elsewhere',
  'No budget now',
  'Stopped replying',
  'Wrong product',
  'Other',
] as const

export function LostSheet({
  lead,
  open,
  onOpenChange,
}: {
  lead: Lead
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Mark ${lead.code} lost`}
      description="Say why. The lead leaves your follow-ups and keeps the reason under Lost."
    >
      <LostForm lead={lead} onDone={() => onOpenChange(false)} />
    </ActionSheet>
  )
}

function LostForm({ lead, onDone }: { lead: Lead; onDone: () => void }) {
  const { dispatch } = useSellerScope()
  const [reason, setReason] = useState<string | null>(null)
  const [detail, setDetail] = useState('')
  const [tried, setTried] = useState(false)
  const error = !reason
    ? 'Choose a reason.'
    : reason === 'Other' && !detail.trim()
      ? 'Describe what happened.'
      : undefined

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (error) return
    const lostReason = detail.trim() ? `${reason} · ${detail.trim()}` : reason!
    dispatch({ type: 'leads/move', id: lead.id, stage: 'lost', lostReason })
    toast('Lead marked lost', { description: `${lead.code} · ${lostReason}` })
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <ChoiceGrid label="Reason" options={REASONS} value={reason} onChange={setReason} />
      <FormField label="What happened" required={reason === 'Other'} error={tried ? error : undefined}>
        <Textarea
          variant="soft"
          className="min-h-20"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Optional for the reasons above"
        />
      </FormField>
      <Button type="submit" size="lg" className="h-14 w-full">
        Mark lost
      </Button>
    </form>
  )
}
