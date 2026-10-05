import type { BrandConfig, BrandPersonality, ButtonStyle, Device, RadiusScale, ToneOfVoice } from '@rc/types'
import {
  BRAND_LOCK_KEYS,
  BRAND_LOCK_LABEL,
  BRAND_PERSONALITY_LABEL,
  BUTTON_STYLE_LABEL,
  DEVICE_LABEL,
  RADIUS_SCALE_LABEL,
  TONE_OF_VOICE_LABEL,
} from '@rc/types'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Chip,
  type Column,
  DataTable,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  PillTabs,
  SegmentedControl,
  Switch,
  cn,
  toast,
} from '@rc/ui'
import { Lock, LockOpen, Save, Sparkles } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useAuth } from '../../auth/auth'
import { StorefrontPreview } from '../../components/StorefrontPreview'
import { LiveStorefront } from '../../components/LiveStorefront'
import { useScoped } from '../../state/scoped'
import { ThemeCard } from './ThemeCard'
import {
  AA,
  COLOR_ROWS,
  type ColorKey,
  LOCK_HINT,
  type TokenRow,
  contrastRatio,
  designTokens,
  isHex,
  sameGuideline,
} from './lib'
import { BRAND_FONT } from '@rc/fixtures'

const PREVIEW_DEVICES: Device[] = ['desktop', 'mobile']
const PERSONALITIES = Object.keys(BRAND_PERSONALITY_LABEL) as BrandPersonality[]
const TONES = Object.keys(TONE_OF_VOICE_LABEL) as ToneOfVoice[]
const RADII = Object.keys(RADIUS_SCALE_LABEL) as RadiusScale[]
const BUTTONS = Object.keys(BUTTON_STYLE_LABEL) as ButtonStyle[]

export function BrandPage() {
  const { tenant } = useScoped()
  // The draft starts from the saved guideline and restarts when the tenant switches.
  return <BrandEditor key={tenant.id} saved={tenant.brand} />
}

function BrandEditor({ saved }: { saved: BrandConfig }) {
  const s = useScoped()
  const { can } = useAuth()
  const canManage = can('brand.manage')
  const [draft, setDraft] = useState<BrandConfig>(saved)
  const [device, setDevice] = useState<Device>('desktop')

  const invalid = COLOR_ROWS.filter((r) => !isHex(draft.colors[r.key]))
  const dirty = !sameGuideline(draft, saved)
  const saveReason = invalid.length
    ? `Fix the ${invalid.map((r) => r.label.toLowerCase()).join(' and ')} colour first.`
    : !dirty
      ? 'No changes to save.'
      : null
  // Locks save on their own, so the preview and the save always use the stored ones.
  const effective: BrandConfig = {
    ...draft,
    locks: saved.locks,
    colors: invalid.length ? { ...draft.colors, ...pickValid(draft, saved) } : draft.colors,
  }
  const home = s.pages.find((p) => p.kind === 'home' && !p.sellerId)

  const set = (patch: Partial<BrandConfig>) => setDraft((d) => ({ ...d, ...patch }))
  const setColor = (key: ColorKey, value: string) =>
    setDraft((d) => ({ ...d, colors: { ...d.colors, [key]: value } }))

  const save = () => {
    if (saveReason) return
    s.dispatch({ type: 'brand/update', tenantId: s.tenantId, brand: { ...draft, locks: saved.locks } })
    toast('Brand guideline saved', {
      tone: 'success',
      description: `Every ${s.tenant.name} storefront now uses the new tokens.`,
    })
  }

  const tokenColumns: Column<TokenRow>[] = [
    {
      id: 'token',
      header: 'Token',
      cell: (r) => <span className="text-xs font-medium font-mono">{r.token}</span>,
    },
    {
      id: 'value',
      header: 'Resolves to',
      cell: (r) => (
        <span className="min-w-0 gap-2 flex items-center">
          {r.swatch && (
            <span
              className="size-4 rounded-md shrink-0 ring-1 ring-border"
              style={{ background: r.swatch }}
            />
          )}
          <span className={cn('min-w-0 truncate', r.swatch && 'text-xs font-mono')}>{r.value}</span>
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Brand guideline"
        description="Colours, type, shape and voice that every page, campaign and personal store reads as design tokens."
        actions={
          canManage ? (
            <div className="gap-2 flex flex-wrap items-center">
              {dirty && (
                <Button variant="outline" onClick={() => setDraft(saved)}>
                  Discard
                </Button>
              )}
              <Button onClick={save} disabled={!!saveReason} title={saveReason ?? undefined}>
                <Save />
                Save guideline
              </Button>
            </div>
          ) : (
            <Badge variant="muted">
              <Lock />
              View only
            </Badge>
          )
        }
      />
      <div className="gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] grid grid-cols-1">
        <div className="min-w-0 space-y-4">
          <ThemeCard
            value={draft.theme}
            saved={saved.theme}
            subdomain={s.tenant.subdomain}
            onChange={(theme) => set({ theme })}
            disabled={!canManage}
          />
          <Card>
            <CardHeader>
              <CardTitle>Identity</CardTitle>
            </CardHeader>
            <CardContent className="gap-4 sm:grid-cols-2 grid grid-cols-1">
              <FormField label="Store name" hint="Change it in tenant settings.">
                <Input variant="soft" readOnly value={s.tenant.name} />
              </FormField>
              <FormField label="Tagline" hint="Personal stores show it when the headline is locked.">
                <Input
                  variant="soft"
                  readOnly={!canManage}
                  value={draft.tagline}
                  onChange={(e) => set({ tagline: e.target.value })}
                />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Colour tokens</CardTitle>
              <CardDescription>
                Templates read these tokens. Change one and every storefront follows.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {COLOR_ROWS.map((row) => {
                const value = draft.colors[row.key]
                const valid = isHex(value)
                return (
                  <div
                    key={row.key}
                    className="gap-3 rounded-2xl p-3 flex flex-wrap items-center bg-surface-2"
                  >
                    <span
                      className="size-10 rounded-xl shrink-0 ring-1 ring-border"
                      style={{ background: valid ? value : saved.colors[row.key] }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{row.label}</p>
                      <p className="text-xs truncate text-muted">
                        <span className="font-mono">{row.token}</span> · {row.hint}
                      </p>
                      {!valid && (
                        <p className="mt-1 text-xs font-medium text-accent-strong">
                          Enter # and six hex digits, for example the saved{' '}
                          {saved.colors[row.key].toUpperCase()}.
                        </p>
                      )}
                    </div>
                    {canManage && (
                      <div className="gap-2 flex items-center">
                        <input
                          type="color"
                          aria-label={`Pick the ${row.label.toLowerCase()} colour`}
                          value={(valid ? value : saved.colors[row.key]).toLowerCase()}
                          onChange={(e) => setColor(row.key, e.target.value)}
                          className="h-10 w-12 rounded-xl p-1 cursor-pointer border border-border bg-card"
                        />
                        <Input
                          aria-label={`${row.label} hex value`}
                          variant="soft"
                          className="w-28"
                          inputClassName="font-mono uppercase"
                          maxLength={7}
                          invalid={!valid}
                          value={value}
                          onChange={(e) =>
                            setColor(
                              row.key,
                              e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`,
                            )
                          }
                        />
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="gap-2 sm:grid-cols-2 grid grid-cols-1">
                <ContrastNote
                  label="Text on background"
                  ratio={contrastRatio(effective.colors.text, effective.colors.background)}
                  fix="Darken the text or lighten the background."
                />
                <ContrastNote
                  label="White on primary"
                  ratio={contrastRatio(effective.colors.primary, 'white')}
                  fix="Darken the primary so button labels stay readable."
                />
              </div>
            </CardContent>
          </Card>

          <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
            <Card>
              <CardHeader>
                <CardTitle>Typography</CardTitle>
                <CardDescription>Every storefront, page and app sets in one typeface.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-2xl p-4 bg-surface-2">
                  <p className="text-3xl font-bold tracking-tight">{BRAND_FONT}</p>
                  <p className="mt-1 text-sm text-muted">Headings and body text · weights 300 to 800</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Shape</CardTitle>
                <CardDescription>
                  Corner radius of cards, images and buttons, and how buttons fill.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField label="Radius">
                  <SegmentedControl
                    size="sm"
                    disabled={!canManage}
                    value={draft.radius}
                    onChange={(v) => set({ radius: RADII.find((r) => r === v) ?? draft.radius })}
                    options={RADII.map((r) => ({ value: r, label: RADIUS_SCALE_LABEL[r] }))}
                  />
                </FormField>
                <FormField label="Button style">
                  <SegmentedControl
                    size="sm"
                    disabled={!canManage}
                    value={draft.buttonStyle}
                    onChange={(v) => set({ buttonStyle: BUTTONS.find((b) => b === v) ?? draft.buttonStyle })}
                    options={BUTTONS.map((b) => ({ value: b, label: BUTTON_STYLE_LABEL[b] }))}
                  />
                </FormField>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Personality and tone</CardTitle>
              <CardDescription className="gap-1.5 flex items-start">
                <Sparkles className="mt-0.5 size-3.5 shrink-0" />
                AI copy suggestions for pages, campaigns and product text follow these two choices.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ChoiceGroup label="Personality">
                {canManage ? (
                  PERSONALITIES.map((p) => (
                    <Chip
                      key={p}
                      variant="filter"
                      active={draft.personality === p}
                      onClick={() => set({ personality: p })}
                    >
                      {BRAND_PERSONALITY_LABEL[p]}
                    </Chip>
                  ))
                ) : (
                  <Badge variant="ink">{BRAND_PERSONALITY_LABEL[draft.personality]}</Badge>
                )}
              </ChoiceGroup>
              <ChoiceGroup label="Tone of voice">
                {canManage ? (
                  TONES.map((t) => (
                    <Chip key={t} variant="filter" active={draft.tone === t} onClick={() => set({ tone: t })}>
                      {TONE_OF_VOICE_LABEL[t]}
                    </Chip>
                  ))
                ) : (
                  <Badge variant="ink">{TONE_OF_VOICE_LABEL[draft.tone]}</Badge>
                )}
              </ChoiceGroup>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="min-w-0">
            <CardHeader
              action={
                <PillTabs
                  size="sm"
                  value={device}
                  onValueChange={(v) => setDevice(PREVIEW_DEVICES.find((d) => d === v) ?? 'desktop')}
                  items={PREVIEW_DEVICES.map((d) => ({ value: d, label: DEVICE_LABEL[d] }))}
                />
              }
            >
              <CardTitle>Live preview</CardTitle>
              <CardDescription>
                {dirty
                  ? 'Your homepage with the unsaved guideline.'
                  : 'Your homepage with the saved guideline.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {home ? (
                <LiveStorefront
                  tenant={s.tenant}
                  device={device}
                  page={home}
                  brand={effective}
                  fallback={
                    <div className="rounded-2xl max-h-[640px] overflow-y-auto">
                      <StorefrontPreview
                        brand={effective}
                        storeName={s.tenant.name}
                        sections={home.sections}
                        device={device}
                        products={s.maps.product}
                      />
                    </div>
                  }
                />
              ) : (
                <EmptyState
                  compact
                  title="No homepage yet"
                  description="Create the homepage from a store template to preview the guideline on it."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Design tokens</CardTitle>
              <CardDescription>
                Templates read token names, never hex values, so a guideline change reaches every page at
                once.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={tokenColumns}
                rows={designTokens(effective)}
                getRowKey={(r) => r.token}
                pageSize={0}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brand governance</CardTitle>
              <CardDescription>
                Locked settings apply to every seller store and campaign page. Changes save right away.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {BRAND_LOCK_KEYS.map((key) => {
                const locked = saved.locks[key]
                const label = BRAND_LOCK_LABEL[key]
                return (
                  <div
                    key={key}
                    className="gap-3 rounded-2xl p-3 flex items-center justify-between bg-surface-2"
                  >
                    <div className="min-w-0">
                      <p className="gap-1.5 text-sm font-medium flex items-center">
                        {locked ? (
                          <Lock className="size-3.5 shrink-0" />
                        ) : (
                          <LockOpen className="size-3.5 shrink-0 text-muted" />
                        )}
                        {label}
                      </p>
                      <p className="text-xs text-muted">
                        {locked ? LOCK_HINT[key].locked : LOCK_HINT[key].unlocked}
                      </p>
                    </div>
                    {canManage ? (
                      <Switch
                        aria-label={`Lock ${label.toLowerCase()}`}
                        checked={locked}
                        onCheckedChange={() => {
                          s.dispatch({ type: 'brand/toggleLock', tenantId: s.tenantId, key })
                          toast(`${label} ${locked ? 'unlocked' : 'locked'}`, {
                            tone: 'success',
                            description: locked ? LOCK_HINT[key].unlocked : LOCK_HINT[key].locked,
                          })
                        }}
                      />
                    ) : (
                      <Badge variant={locked ? 'ink' : 'muted'}>{locked ? 'Locked' : 'Editable'}</Badge>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

/** Saved values stand in for colours that are mid-edit, so the preview never breaks. */
function pickValid(draft: BrandConfig, saved: BrandConfig): Partial<BrandConfig['colors']> {
  return Object.fromEntries(
    COLOR_ROWS.filter((r) => !isHex(draft.colors[r.key])).map((r) => [r.key, saved.colors[r.key]]),
  )
}

function ContrastNote({ label, ratio, fix }: { label: string; ratio: number; fix: string }) {
  const pass = ratio >= AA
  return (
    <div className={cn('rounded-xl px-3 py-2 text-xs', pass ? 'bg-surface-2' : 'bg-warning-soft')}>
      <p className="gap-2 flex flex-wrap items-center justify-between">
        <span className="font-semibold">{label}</span>
        <span className={cn('font-semibold tabular-nums', pass ? 'text-success' : 'text-warning')}>
          {ratio.toFixed(1)}:1
        </span>
      </p>
      <p className={pass ? 'text-muted' : 'text-warning'}>
        {pass ? 'Passes WCAG AA for body text.' : `Under ${AA}:1. ${fix}`}
      </p>
    </div>
  )
}

function ChoiceGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <div className="gap-2 flex flex-wrap">{children}</div>
    </div>
  )
}
