import type { BrandConfig, BrandPersonality, Device, ToneOfVoice } from '@rc/types'
import {
  BRAND_LOCK_KEYS,
  BRAND_LOCK_LABEL,
  BRAND_PERSONALITY_LABEL,
  DEVICE_LABEL,
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
  Switch,
  cn,
  toast,
} from '@rc/ui'
import { Lock, LockOpen, Save, Sparkles } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useAuth } from '../../auth/auth'
import { StorefrontPreview } from '../../components/StorefrontPreview'
import { LiveStorefront } from '../../components/LiveStorefront'
import { ImageUpload } from '../../components/ImageUpload'
import { useScoped } from '../../state/scoped'
import { Advanced, ButtonPicker, CornerPicker, FontPicker, PalettePicker } from './LookPickers'
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

const PREVIEW_DEVICES: Device[] = ['desktop', 'mobile']
const PERSONALITIES = Object.keys(BRAND_PERSONALITY_LABEL) as BrandPersonality[]
const TONES = Object.keys(TONE_OF_VOICE_LABEL) as ToneOfVoice[]

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
    toast('Look saved', {
      tone: 'success',
      description: `Every ${s.tenant.name} store page now uses it.`,
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

  const colorRows = COLOR_ROWS.map((row) => {
    const value = draft.colors[row.key]
    const valid = isHex(value)
    return (
      <div key={row.key} className="gap-3 rounded-2xl p-3 flex flex-wrap items-center bg-card">
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
              Enter # and six hex digits, for example the saved {saved.colors[row.key].toUpperCase()}.
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
                setColor(row.key, e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`)
              }
            />
          </div>
        )}
      </div>
    )
  })
  const textRatio = contrastRatio(effective.colors.text, effective.colors.background)
  const buttonRatio = contrastRatio(effective.colors.primary, 'white')

  return (
    <>
      <PageHeader
        title="Look and feel"
        description="Your logo, colours and fonts. The preview changes as you pick."
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
                Save
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
          <Card>
            <CardHeader>
              <CardTitle>Logo</CardTitle>
              <CardDescription>
                Shown at the top of every page. Without one, the store shows its name.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ImageUpload
                id="brand-logo"
                tenantId={s.tenantId}
                label="Logo"
                value={draft.logoUrl}
                disabled={!canManage}
                onChange={(logoUrl) => set({ logoUrl })}
              />
              <FormField label="Tagline" hint="A short line about your store.">
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
              <CardTitle>Colours</CardTitle>
              <CardDescription>Pick a set. Each one keeps text and buttons easy to read.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <PalettePicker
                colors={draft.colors}
                disabled={!canManage}
                onPick={(colors) => set({ colors })}
              />
              {(textRatio < AA || buttonRatio < AA) && (
                <p className="rounded-xl px-3 py-2 text-xs bg-warning-soft text-warning">
                  Some text may be hard to read with these colours. Open Advanced to check, or pick a set
                  above.
                </p>
              )}
              <Advanced>
                <p className="text-xs text-muted">Set each colour by hand.</p>
                {colorRows}
                <div className="gap-2 sm:grid-cols-2 grid grid-cols-1">
                  <ContrastNote
                    label="Text on background"
                    ratio={textRatio}
                    fix="Darken the text or lighten the background."
                  />
                  <ContrastNote
                    label="White on primary"
                    ratio={buttonRatio}
                    fix="Darken the primary so button labels stay readable."
                  />
                </div>
              </Advanced>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fonts</CardTitle>
              <CardDescription>One font for headings, one for the rest.</CardDescription>
            </CardHeader>
            <CardContent>
              <FontPicker
                fonts={draft.fonts}
                storeName={s.tenant.name}
                disabled={!canManage}
                onPick={(fonts) => set({ fonts })}
              />
            </CardContent>
          </Card>

          <ThemeCard
            value={draft.theme}
            saved={saved.theme}
            subdomain={s.tenant.subdomain}
            onChange={(theme) => set({ theme })}
            disabled={!canManage}
          />

          <Card>
            <CardHeader>
              <CardTitle>Style</CardTitle>
              <CardDescription>The corners of photos and cards, and the shape of buttons.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ChoiceGroup label="Corners" bare>
                <CornerPicker
                  value={draft.radius}
                  disabled={!canManage}
                  onPick={(radius) => set({ radius })}
                />
              </ChoiceGroup>
              <ChoiceGroup label="Buttons" bare>
                <ButtonPicker
                  value={draft.buttonStyle}
                  radius={draft.radius}
                  disabled={!canManage}
                  onPick={(buttonStyle) => set({ buttonStyle })}
                />
              </ChoiceGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Personality and tone</CardTitle>
              <CardDescription className="gap-1.5 flex items-start">
                <Sparkles className="mt-0.5 size-3.5 shrink-0" />
                Suggested text for pages, campaigns and products follows these.
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
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                {dirty ? 'Your home page with your unsaved changes.' : 'Your home page as shoppers see it.'}
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
                    <div className="rounded-2xl max-h-[40rem] overflow-y-auto">
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
                  title="No home page yet"
                  description="Create the home page from a store template to see your look on it."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brand rules for sellers</CardTitle>
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

          <Card>
            <CardContent>
              <Advanced label="Advanced: design tokens">
                <p className="text-xs text-muted">
                  Templates read these names, so a change here reaches every page at once.
                </p>
                <DataTable
                  columns={tokenColumns}
                  rows={designTokens(effective)}
                  getRowKey={(r) => r.token}
                  pageSize={0}
                />
              </Advanced>
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

function ChoiceGroup({ label, bare, children }: { label: string; bare?: boolean; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-2 text-sm font-medium">{label}</p>
      {bare ? children : <div className="gap-2 flex flex-wrap">{children}</div>}
    </div>
  )
}
