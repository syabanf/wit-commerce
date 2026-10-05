import { fmtDate, newId, nowIso, plural, segmentMembers, segmentRemoveBlocker } from '@rc/fixtures'
import type { Segment, SegmentRule } from '@rc/types'
import {
  ActionMenu,
  Banner,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  SegmentedControl,
  Textarea,
  toast,
} from '@rc/ui'
import { CopyPlus, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { CampaignStatusBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useScoped } from '../../state/scoped'
import { customerCities } from '../customers/lib'
import { PreviewCard } from './PreviewCard'
import { RuleRow } from './RuleRow'
import { defaultRule, ruleError, ruleSummary } from './lib'

const LIST = '/customers/segments'
const MATCH_OPTIONS = [
  { value: 'all', label: 'Match all rules' },
  { value: 'any', label: 'Match any rule' },
]

export function SegmentDetailPage() {
  const { id } = useParams()
  const { segments } = useScoped()
  const segment = id === 'new' ? null : segments.find((x) => x.id === id)

  if (segment === undefined) {
    return (
      <Card>
        <EmptyState
          title="Segment not found"
          description="It may have been removed or belongs to another brand."
          action={<BackButton fallback={LIST} />}
        />
      </Card>
    )
  }
  // A new key resets the draft when moving between segments.
  return <SegmentEditor key={id} segment={segment} />
}

function SegmentEditor({ segment }: { segment: Segment | null }) {
  const s = useScoped()
  const { can } = useAuth()
  const navigate = useNavigate()
  const manage = can('segment.manage')
  const readOnly = !manage || !!segment?.builtIn
  const [draft, setDraft] = useState(() => ({
    name: segment?.name ?? '',
    description: segment?.description ?? '',
    match: segment?.match ?? ('all' as Segment['match']),
    rules: segment?.rules ?? [defaultRule('orders')],
  }))
  const [tried, setTried] = useState(false)
  const [removing, setRemoving] = useState(false)
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }))
  const setRule = (index: number, rule: SegmentRule) =>
    set({ rules: draft.rules.map((r, i) => (i === index ? rule : r)) })

  const cities = useMemo(() => customerCities(s.customers), [s.customers])
  const members = useMemo(
    () => segmentMembers({ rules: draft.rules, match: draft.match }, s.customers, s.crm),
    [draft.rules, draft.match, s.customers, s.crm],
  )
  const campaigns = segment ? s.campaigns.filter((c) => c.segmentId === segment.id) : []
  const removeBlock = segment ? segmentRemoveBlocker(segment, s.campaigns) : null

  const name = draft.name.trim()
  const duplicateName = s.segments.find(
    (x) => x.id !== segment?.id && x.name.toLowerCase() === name.toLowerCase(),
  )
  const ruleErrors = draft.rules.map(ruleError)
  const nameError = !name
    ? 'Name the segment, such as Trail runners in Bandung.'
    : duplicateName
      ? `${duplicateName.name} already uses this name. Choose another.`
      : undefined
  const dirty =
    !segment ||
    segment.name !== name ||
    segment.description !== draft.description.trim() ||
    segment.match !== draft.match ||
    JSON.stringify(segment.rules) !== JSON.stringify(draft.rules)

  const save = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (nameError || ruleErrors.some(Boolean)) return
    const saved: Segment = {
      id: segment?.id ?? newId('seg'),
      tenantId: s.tenantId,
      name,
      description: draft.description.trim(),
      builtIn: false,
      match: draft.match,
      rules: draft.rules,
      createdAt: segment?.createdAt ?? nowIso(),
    }
    s.dispatch({ type: 'segments/save', segment: saved })
    toast(segment ? 'Segment saved' : 'Segment created', {
      tone: 'success',
      description: `${name} · ${plural(members.length, 'customer')}`,
    })
    if (!segment) navigate(paths.segment(saved.id), { replace: true })
  }

  const duplicate = () => {
    if (!segment) return
    const copy: Segment = {
      ...segment,
      id: newId('seg'),
      name: `${segment.name} (custom)`,
      builtIn: false,
      createdAt: nowIso(),
    }
    s.dispatch({ type: 'segments/save', segment: copy })
    toast('Segment duplicated', { tone: 'success', description: `${copy.name} · edit its rules freely` })
    navigate(paths.segment(copy.id))
  }

  const remove = () => {
    if (!segment || removeBlock) return
    s.dispatch({ type: 'segments/remove', id: segment.id })
    toast('Segment removed', { description: segment.name })
    navigate(LIST, { replace: true })
  }

  const menu =
    segment && manage
      ? [
          {
            key: 'duplicate',
            label: 'Duplicate as custom',
            description: 'A copy you can edit',
            icon: <CopyPlus />,
            onSelect: duplicate,
          },
          ...(segment.builtIn
            ? []
            : [
                'separator' as const,
                {
                  key: 'remove',
                  label: 'Remove segment',
                  description: removeBlock ?? 'Campaigns can no longer target it',
                  icon: <Trash2 />,
                  destructive: true,
                  disabled: !!removeBlock,
                  onSelect: () => setRemoving(true),
                },
              ]),
        ]
      : []

  return (
    <form onSubmit={save} noValidate className="space-y-4">
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <BackButton fallback={LIST} />
        <div className="gap-2 flex flex-wrap items-center">
          {segment?.builtIn && manage && (
            <Button type="button" variant="outline" onClick={duplicate}>
              <CopyPlus />
              Duplicate as custom
            </Button>
          )}
          {!readOnly && (
            <Button
              type="submit"
              disabled={!!segment && !dirty}
              title={segment && !dirty ? 'No changes to save.' : undefined}
            >
              {segment ? 'Save segment' : 'Create segment'}
            </Button>
          )}
          {menu.length > 0 && (
            <ActionMenu
              title={segment?.name}
              trigger={
                <Button type="button" variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              }
              items={menu}
            />
          )}
        </div>
      </div>

      <PageHeader
        className="mb-0"
        eyebrow={
          segment
            ? `${segment.builtIn ? 'Built-in' : 'Custom'} segment · created ${fmtDate(segment.createdAt)}`
            : 'New segment'
        }
        title={name || 'Untitled segment'}
        description={ruleSummary(draft, s.categoryName)}
      />

      {segment?.builtIn && (
        <Banner tone="neutral" title="Built-in segments are read-only">
          The platform keeps their rules in step with the lifecycle. Duplicate it as a custom segment to
          change the rules.
        </Banner>
      )}
      {!manage && !segment?.builtIn && (
        <Banner
          tone="neutral"
          title="You can view this segment. Marketing and tenant admins edit segments."
        />
      )}

      <div className="gap-4 xl:grid-cols-[minmax(0,1fr)_380px] grid grid-cols-1">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="gap-4 grid grid-cols-1">
              <FormField label="Name" required htmlFor="segment-name" error={tried ? nameError : undefined}>
                <Input
                  id="segment-name"
                  value={draft.name}
                  disabled={readOnly}
                  placeholder="Trail runners in Bandung"
                  onChange={(e) => set({ name: e.target.value })}
                />
              </FormField>
              <FormField
                label="Description"
                htmlFor="segment-description"
                hint="Tell marketers when to use this audience."
              >
                <Textarea
                  id="segment-description"
                  className="min-h-20"
                  value={draft.description}
                  disabled={readOnly}
                  onChange={(e) => set({ description: e.target.value })}
                />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              action={
                !readOnly && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => set({ rules: [...draft.rules, defaultRule('spend')] })}
                  >
                    <Plus />
                    Add rule
                  </Button>
                )
              }
            >
              <CardTitle>Rules</CardTitle>
              <p className="text-sm text-muted">
                Customers who match {draft.match === 'all' ? 'every rule' : 'at least one rule'} join the
                segment.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <SegmentedControl
                aria-label="How rules combine"
                size="sm"
                options={MATCH_OPTIONS}
                value={draft.match}
                disabled={readOnly}
                onChange={(v) => set({ match: v as Segment['match'] })}
              />
              <ol className="space-y-2">
                {draft.rules.map((rule, i) => (
                  <RuleRow
                    key={i}
                    index={i}
                    rule={rule}
                    cities={cities}
                    error={tried ? ruleErrors[i]! : null}
                    readOnly={readOnly}
                    canRemove={draft.rules.length > 1}
                    onChange={(next) => setRule(i, next)}
                    onRemove={() => set({ rules: draft.rules.filter((_, j) => j !== i) })}
                  />
                ))}
              </ol>
            </CardContent>
          </Card>

          {segment && (
            <Card>
              <CardHeader>
                <CardTitle>Used by campaigns</CardTitle>
              </CardHeader>
              <CardContent>
                {campaigns.length ? (
                  <ul className="space-y-2">
                    {campaigns.map((c) => (
                      <li key={c.id}>
                        <Link
                          to={paths.campaign(c.id)}
                          className="gap-3 rounded-2xl px-3 py-2.5 flex items-center bg-surface-2 transition-colors hover:bg-surface"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="text-sm font-medium block truncate">{c.name}</span>
                            <span className="block truncate font-mono text-[11px] text-muted">{c.code}</span>
                          </span>
                          <CampaignStatusBadge status={c.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">No campaign targets this segment yet.</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        <div className="min-w-0">
          <PreviewCard members={members} total={s.customers.length} />
        </div>
      </div>

      {segment && (
        <ConfirmDialog
          open={removing}
          onOpenChange={setRemoving}
          destructive
          title={`Remove ${segment.name}?`}
          description="Campaigns, promotions and automations can no longer target it. Customers stay as they are."
          confirmLabel="Remove segment"
          cancelLabel="Keep segment"
          onConfirm={remove}
        />
      )}
    </form>
  )
}
