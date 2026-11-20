import {
  DEFAULT_DPP_DENOMINATOR,
  DEFAULT_DPP_NUMERATOR,
  DEFAULT_PPN_RATE,
  TAX_PROFILES,
  TAX_PROFILE_LABEL,
  normalizeTax,
  taxBlocker,
} from '@rc/fixtures'
import type { TaxOverride, TaxProfile, TaxSettings } from '@rc/types'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Combobox,
  FormField,
  Input,
  NativeSelect,
  Switch,
  toast,
} from '@rc/ui'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../auth/auth'
import { useScoped } from '../../state/scoped'

interface Draft {
  pkp: boolean
  pricesIncludeTax: boolean
  profile: TaxProfile
  ratePct: string
  dppNumerator: string
  dppDenominator: string
  overrides: TaxOverride[]
}

const NO_TAX: TaxSettings = { pkp: false, pricesIncludeTax: true, profile: 'standard' }

const toDraft = (t: TaxSettings): Draft => ({
  pkp: t.pkp,
  pricesIncludeTax: t.pricesIncludeTax,
  profile: t.profile,
  ratePct: t.ratePct === undefined ? '' : String(t.ratePct),
  dppNumerator: t.dppNumerator === undefined ? '' : String(t.dppNumerator),
  dppDenominator: t.dppDenominator === undefined ? '' : String(t.dppDenominator),
  overrides: t.overrides ?? [],
})

const optional = (s: string) => (s.trim() === '' ? undefined : Number(s))

const fromDraft = (d: Draft): TaxSettings =>
  normalizeTax({
    pkp: d.pkp,
    pricesIncludeTax: d.pricesIncludeTax,
    profile: d.profile,
    ratePct: optional(d.ratePct),
    dppNumerator: optional(d.dppNumerator),
    dppDenominator: optional(d.dppDenominator),
    overrides: d.overrides.filter((o) => o.id),
  })

const profileOptions = TAX_PROFILES.map((p) => ({ value: p, label: TAX_PROFILE_LABEL[p] }))

/** PPN settings: whether the brand is a PKP, how its prices hold PPN, and per item overrides. */
export function TaxCard() {
  const s = useScoped()
  const { can } = useAuth()
  const canManage = can('brand.manage')
  const saved = s.tenant.tax ?? NO_TAX
  const [draft, setDraft] = useState(() => toDraft(saved))
  const [saving, setSaving] = useState(false)
  const next = fromDraft(draft)
  const blocker = taxBlocker(next, s.tenant.legal)
  const dirty = JSON.stringify(next) !== JSON.stringify(normalizeTax(saved))
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const setOverride = (i: number, patch: Partial<TaxOverride>) =>
    set({ overrides: draft.overrides.map((o, j) => (j === i ? { ...o, ...patch } : o)) })

  const save = async () => {
    setSaving(true)
    try {
      await s.dispatchAsync({ type: 'tenants/setTax', tenantId: s.tenantId, tax: next })
      toast('Tax settings saved', {
        tone: 'success',
        description: next.pkp ? 'New orders carry PPN from now on.' : 'New orders carry no PPN.',
      })
    } catch (err) {
      toast('Not saved', { tone: 'danger', description: (err as Error).message })
    }
    setSaving(false)
  }

  const number = (key: 'ratePct' | 'dppNumerator' | 'dppDenominator', label: string, placeholder: number) => (
    <Input
      aria-label={label}
      inputMode="decimal"
      className="w-20"
      inputClassName="tabular-nums"
      variant="soft"
      placeholder={String(placeholder)}
      disabled={!canManage || !draft.pkp}
      value={draft[key]}
      onChange={(e) => set({ [key]: e.target.value.replace(/[^\d.]/g, '') })}
    />
  )

  return (
    <Card>
      <CardHeader>
        <div className="gap-2 flex flex-wrap items-center justify-between">
          <CardTitle>Tax (PPN)</CardTitle>
          <Badge variant={saved.pkp ? 'success' : 'muted'}>{saved.pkp ? 'PKP' : 'Not PKP'}</Badge>
        </div>
        <CardDescription>
          Only a PKP, a business registered for VAT with an NPWP, charges PPN. Most goods pay 12% on a tax
          base of 11/12 of the price, so 11% in effect; luxury goods pay 12% on the full price. Shipping is
          the courier&apos;s charge and carries no PPN. Orders keep the rates of the day they were placed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="gap-3 rounded-2xl px-4 py-3 flex items-center justify-between bg-surface-2">
          <span className="text-sm">
            <span className="font-medium block">Registered as PKP</span>
            <span className="text-muted">
              {s.tenant.legal?.npwp
                ? `NPWP ${s.tenant.legal.npwp}`
                : 'Add the NPWP in the seller identity first.'}
            </span>
          </span>
          <Switch
            aria-label="Registered as PKP"
            checked={draft.pkp}
            disabled={!canManage}
            onCheckedChange={(pkp) => set({ pkp })}
          />
        </label>
        <div className="gap-4 md:grid-cols-2 grid grid-cols-1">
          <FormField label="Catalog prices" hint="Including PPN keeps what shoppers pay today.">
            <NativeSelect
              variant="soft"
              disabled={!canManage || !draft.pkp}
              value={draft.pricesIncludeTax ? 'include' : 'exclude'}
              options={[
                { value: 'include', label: 'Include PPN' },
                { value: 'exclude', label: 'Exclude PPN, added at checkout' },
              ]}
              onChange={(e) => set({ pricesIncludeTax: e.target.value === 'include' })}
            />
          </FormField>
          <FormField label="Default profile" hint="For every product without an override.">
            <NativeSelect
              variant="soft"
              disabled={!canManage || !draft.pkp}
              value={draft.profile}
              options={profileOptions}
              onChange={(e) => set({ profile: e.target.value as TaxProfile })}
            />
          </FormField>
        </div>
        <div className="gap-x-6 gap-y-2 text-sm flex flex-wrap items-center">
          <span className="gap-2 flex items-center">
            Rate {number('ratePct', 'PPN rate in percent', DEFAULT_PPN_RATE)} %
          </span>
          <span className="gap-2 flex items-center">
            Standard tax base {number('dppNumerator', 'Tax base numerator', DEFAULT_DPP_NUMERATOR)} /{' '}
            {number('dppDenominator', 'Tax base denominator', DEFAULT_DPP_DENOMINATOR)}
          </span>
          <span className="text-xs text-muted">Leave empty for the current law.</span>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Overrides</p>
          {draft.overrides.length === 0 && (
            <p className="text-sm text-muted">Every product uses the default profile.</p>
          )}
          {draft.overrides.map((o, i) => (
            <div
              key={i}
              className="gap-2 rounded-2xl p-2 sm:flex-nowrap flex flex-wrap items-center bg-surface-2"
            >
              <div className="min-w-0 sm:w-auto w-full flex-1">
                {o.kind === 'product' ? (
                  <Combobox
                    variant="soft"
                    aria-label="Product"
                    items={s.products}
                    value={o.id || null}
                    onChange={(id) => setOverride(i, { id: id ?? '' })}
                    getKey={(p) => p.id}
                    getLabel={(p) => p.name}
                    placeholder="Choose a product"
                    disabled={!canManage || !draft.pkp}
                  />
                ) : (
                  <Combobox
                    variant="soft"
                    aria-label="Category"
                    items={s.categories}
                    value={o.id || null}
                    onChange={(id) => setOverride(i, { id: id ?? '' })}
                    getKey={(c) => c.id}
                    getLabel={(c) => c.name}
                    placeholder="Choose a category"
                    disabled={!canManage || !draft.pkp}
                  />
                )}
              </div>
              <NativeSelect
                variant="soft"
                className="sm:w-48 w-full"
                aria-label="Profile"
                disabled={!canManage || !draft.pkp}
                value={o.profile}
                options={TAX_PROFILES.map((p) => ({ value: p, label: p[0]!.toUpperCase() + p.slice(1) }))}
                onChange={(e) => setOverride(i, { profile: e.target.value as TaxProfile })}
              />
              {canManage && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove override"
                  disabled={!draft.pkp}
                  onClick={() => set({ overrides: draft.overrides.filter((_, j) => j !== i) })}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
          {canManage && draft.pkp && (
            <div className="gap-2 flex flex-wrap">
              {(['product', 'category'] as const).map((kind) => (
                <Button
                  key={kind}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    set({ overrides: [...draft.overrides, { kind, id: '', profile: 'exempt' }] })
                  }
                >
                  <Plus /> {kind === 'product' ? 'Product' : 'Category'}
                </Button>
              ))}
            </div>
          )}
        </div>

        {canManage ? (
          <div className="gap-2 flex flex-wrap items-center justify-end">
            {blocker && dirty && (
              <p role="alert" className="text-sm mr-auto text-danger">
                {blocker}
              </p>
            )}
            <Button variant="outline" disabled={!dirty || saving} onClick={() => setDraft(toDraft(saved))}>
              Reset
            </Button>
            <Button loading={saving} disabled={!dirty || !!blocker} onClick={save}>
              Save tax settings
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted">Your role cannot change these settings.</p>
        )}
      </CardContent>
    </Card>
  )
}
