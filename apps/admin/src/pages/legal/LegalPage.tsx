import {
  COURIERS_WITH_ETA,
  DEFAULT_COMPLAINT_DAYS,
  DEFAULT_COMPLAINT_PROCEDURE,
  DEFAULT_COURIER_ETA,
  courierEta,
  courierEtaBlocker,
  legalBlocker,
  legalMissing,
  normalizeLegal,
  termsVersion,
} from '@rc/fixtures'
import type { BusinessType, Courier, DisputeForum, EtaDays, SellerLegal } from '@rc/types'
import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABEL,
  COURIER_LABEL,
  DISPUTE_FORUMS,
  DISPUTE_FORUM_LABEL,
} from '@rc/types'
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
  NativeSelect,
  PageHeader,
  Textarea,
  toast,
} from '@rc/ui'
import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../auth/auth'
import { storefrontUrl } from '../../lib/storefront'
import { useScoped } from '../../state/scoped'

/** Seller identity, complaint service, terms choices and delivery days (PP 80/2019). */
export function LegalPage() {
  const { tenant } = useScoped()
  const legal = tenant.legal ?? {}
  const etas = tenant.courierEtaDays ?? {}
  return (
    <>
      <PageHeader
        title="Legal & policies"
        description="Who shoppers buy from, how they complain, and the terms they agree to at checkout. Indonesian law (PP 80/2019) asks every online seller to show these."
      />
      <div className="space-y-4">
        {/* The drafts restart when the tenant switches or its saved values change. */}
        <LegalEditor key={`${tenant.id}:${JSON.stringify(legal)}`} saved={legal} />
        <DeliveryDaysCard key={`${tenant.id}:${JSON.stringify(etas)}`} />
      </div>
    </>
  )
}

type Draft = Record<Exclude<keyof SellerLegal, 'complaintDays'>, string> & { complaintDays: string }

const toDraft = (l: SellerLegal): Draft => ({
  entityName: l.entityName ?? '',
  businessType: l.businessType ?? '',
  nib: l.nib ?? '',
  npwp: l.npwp ?? '',
  address: l.address ?? '',
  city: l.city ?? '',
  phone: l.phone ?? '',
  email: l.email ?? '',
  hours: l.hours ?? '',
  complaintProcedure: l.complaintProcedure ?? '',
  complaintDays: l.complaintDays === undefined ? '' : String(l.complaintDays),
  disputeForum: l.disputeForum ?? '',
  disputeVenue: l.disputeVenue ?? '',
  termsExtra: l.termsExtra ?? '',
})

const fromDraft = (d: Draft): SellerLegal =>
  normalizeLegal({
    ...d,
    businessType: (d.businessType || undefined) as BusinessType | undefined,
    disputeForum: (d.disputeForum || undefined) as DisputeForum | undefined,
    complaintDays: d.complaintDays.trim() === '' ? undefined : Number(d.complaintDays),
  })

function LegalEditor({ saved }: { saved: SellerLegal }) {
  const s = useScoped()
  const { can } = useAuth()
  const canManage = can('brand.manage')
  const [draft, setDraft] = useState(() => toDraft(saved))
  const [saving, setSaving] = useState(false)
  const next = fromDraft(draft)
  const blocker = legalBlocker(next)
  const dirty = JSON.stringify(next) !== JSON.stringify(normalizeLegal(saved))
  const missing = legalMissing({ legal: next })

  const text = (key: Exclude<keyof Draft, 'complaintDays'>) => ({
    value: draft[key],
    disabled: !canManage,
    variant: 'soft' as const,
    onChange: (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [key]: e.target.value })),
  })
  const save = async () => {
    setSaving(true)
    try {
      await s.dispatchAsync({ type: 'tenants/setLegal', tenantId: s.tenantId, legal: next })
      toast('Legal details saved', {
        tone: 'success',
        description: `${s.tenant.name} · terms version ${termsVersion({ ...s.tenant, legal: next })}`,
      })
    } catch (err) {
      toast('Not saved', { tone: 'danger', description: (err as Error).message })
    }
    setSaving(false)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="gap-2 flex flex-wrap items-center justify-between">
            <CardTitle>Seller identity</CardTitle>
            {missing.length ? (
              <Badge variant="warning">{missing.length} missing</Badge>
            ) : (
              <Badge variant="success">Complete</Badge>
            )}
          </div>
          <CardDescription>
            The storefront footer shows the legal name, NIB, address and customer service contact on every
            page.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-4 md:grid-cols-2 grid grid-cols-1">
          <FormField label="Legal name" hint="As registered, e.g. PT Lari Nusantara.">
            <Input {...text('entityName')} />
          </FormField>
          <FormField label="Business type">
            <NativeSelect
              variant="soft"
              disabled={!canManage}
              value={draft.businessType}
              placeholder="Choose one"
              options={BUSINESS_TYPES.map((t) => ({ value: t, label: BUSINESS_TYPE_LABEL[t] }))}
              onChange={(e) => setDraft((d) => ({ ...d, businessType: e.target.value }))}
            />
          </FormField>
          <FormField label="NIB" hint="Nomor Induk Berusaha, 13 digits.">
            <Input inputMode="numeric" {...text('nib')} />
          </FormField>
          <FormField label="NPWP" hint="Optional. 15 or 16 digits.">
            <Input {...text('npwp')} />
          </FormField>
          <FormField label="Registered address" className="md:col-span-2">
            <Textarea rows={2} {...text('address')} />
          </FormField>
          <FormField
            label="City"
            hint="Disputes go to this city's district court unless you choose otherwise."
          >
            <Input {...text('city')} />
          </FormField>
          <FormField label="Customer service phone or WhatsApp">
            <Input type="tel" {...text('phone')} />
          </FormField>
          <FormField label="Customer service email">
            <Input type="email" {...text('email')} />
          </FormField>
          <FormField label="Service hours" hint="e.g. Monday to Friday, 09:00 to 17:00 WIB.">
            <Input {...text('hours')} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Complaints</CardTitle>
          <CardDescription>
            Shoppers read this on the Help &amp; complaints page. Each complaint they send opens a ticket in
            Support, due in the working days you set here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            label="Resolution time in working days"
            hint={`1 to 30. ${DEFAULT_COMPLAINT_DAYS} unless you change it.`}
          >
            <Input
              inputMode="numeric"
              className="max-w-32"
              inputClassName="tabular-nums"
              placeholder={String(DEFAULT_COMPLAINT_DAYS)}
              variant="soft"
              disabled={!canManage}
              value={draft.complaintDays}
              onChange={(e) =>
                setDraft((d) => ({ ...d, complaintDays: e.target.value.replace(/[^\d]/g, '') }))
              }
            />
          </FormField>
          <FormField
            label="Complaint procedure"
            hint="One step per line. Leave it empty to use the standard text shown."
          >
            <Textarea rows={5} placeholder={DEFAULT_COMPLAINT_PROCEDURE} {...text('complaintProcedure')} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="gap-2 flex flex-wrap items-center justify-between">
            <CardTitle>Terms of sale</CardTitle>
            <a
              href={storefrontUrl(s.tenant, '/terms')}
              target="_blank"
              rel="noreferrer"
              className="gap-1.5 text-sm font-medium inline-flex items-center hover:underline"
            >
              Open the terms <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </div>
          <CardDescription>
            The storefront writes the terms in Bahasa Indonesia from these details, the return window and the
            delivery days. Shoppers agree to them at checkout, and every order keeps the version they agreed
            to. Current version <span className="font-mono">{termsVersion(s.tenant)}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-4 md:grid-cols-2 grid grid-cols-1">
          <FormField label="Where disputes go">
            <NativeSelect
              variant="soft"
              disabled={!canManage}
              value={draft.disputeForum || 'court'}
              options={DISPUTE_FORUMS.map((f) => ({ value: f, label: DISPUTE_FORUM_LABEL[f] }))}
              onChange={(e) =>
                setDraft((d) => ({ ...d, disputeForum: e.target.value === 'court' ? '' : e.target.value }))
              }
            />
          </FormField>
          <FormField
            label="Court or body"
            hint="Optional, e.g. Pengadilan Negeri Jakarta Selatan. Empty uses your city."
          >
            <Input {...text('disputeVenue')} />
          </FormField>
          <FormField
            label="Extra clauses"
            hint="Optional, in Bahasa Indonesia. Added at the end of the terms; they cannot take away shopper rights."
            className="md:col-span-2"
          >
            <Textarea rows={4} {...text('termsExtra')} />
          </FormField>
        </CardContent>
      </Card>

      {canManage ? (
        <div className="gap-2 flex flex-wrap items-center justify-end">
          {blocker && (
            <p role="alert" className="text-sm mr-auto text-danger">
              {blocker}
            </p>
          )}
          <Button variant="outline" disabled={!dirty || saving} onClick={() => setDraft(toDraft(saved))}>
            Reset
          </Button>
          <Button loading={saving} disabled={!dirty || !!blocker} onClick={save}>
            Save legal details
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted">Your role cannot change these settings.</p>
      )}
    </>
  )
}

function DeliveryDaysCard() {
  const s = useScoped()
  const { can } = useAuth()
  const canManage = can('brand.manage')
  const offered = COURIERS_WITH_ETA.filter(
    (c) => !s.tenant.shippingCouriers?.length || s.tenant.shippingCouriers.includes(c),
  )
  const [draft, setDraft] = useState<Record<string, { min: string; max: string }>>(() =>
    Object.fromEntries(
      offered.map((c) => {
        const eta = courierEta(s.tenant, c)
        return [c, { min: String(eta.min), max: String(eta.max) }]
      }),
    ),
  )
  const [saving, setSaving] = useState(false)
  // Only days that differ from the platform's estimate are stored.
  const next: Partial<Record<Courier, EtaDays>> = {}
  for (const c of offered) {
    const eta = { min: Number(draft[c]!.min), max: Number(draft[c]!.max) }
    const base = DEFAULT_COURIER_ETA[c]
    if (eta.min !== base.min || eta.max !== base.max) next[c] = eta
  }
  const blocker = offered.some((c) => draft[c]!.min === '' || draft[c]!.max === '')
    ? 'Enter both days for every courier.'
    : courierEtaBlocker(next)
  const dirty = JSON.stringify(next) !== JSON.stringify(s.tenant.courierEtaDays ?? {})

  const save = async () => {
    setSaving(true)
    try {
      await s.dispatchAsync({ type: 'tenants/setCourierEta', tenantId: s.tenantId, courierEtaDays: next })
      toast('Delivery days saved', {
        tone: 'success',
        description: 'Product pages and order pages show the new estimates.',
      })
    } catch (err) {
      toast('Not saved', { tone: 'danger', description: (err as Error).message })
    }
    setSaving(false)
  }
  const day = (c: Courier, edge: 'min' | 'max') => (
    <Input
      aria-label={`${COURIER_LABEL[c]} ${edge === 'min' ? 'earliest' : 'latest'} day`}
      inputMode="numeric"
      variant="soft"
      className="w-20"
      inputClassName="tabular-nums"
      disabled={!canManage}
      value={draft[c]![edge]}
      onChange={(e) =>
        setDraft((d) => ({ ...d, [c]: { ...d[c]!, [edge]: e.target.value.replace(/[^\d]/g, '') } }))
      }
    />
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delivery days</CardTitle>
        <CardDescription>
          Whole days from when the parcel ships. Product pages show them before purchase, and the order page
          turns them into an arrival window once the order ships. 0 means the same day.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {offered.map((c) => (
          <div
            key={c}
            className="gap-3 rounded-2xl px-4 py-2 flex flex-wrap items-center justify-between bg-surface-2"
          >
            <span className="text-sm font-medium">{COURIER_LABEL[c]}</span>
            <span className="gap-2 text-sm flex items-center">
              {day(c, 'min')} to {day(c, 'max')} days
            </span>
          </div>
        ))}
        {canManage && (
          <div className="gap-2 flex flex-wrap items-center justify-end">
            {blocker && dirty && (
              <p role="alert" className="text-sm mr-auto text-danger">
                {blocker}
              </p>
            )}
            <Button loading={saving} disabled={!dirty || !!blocker} onClick={save}>
              Save delivery days
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
