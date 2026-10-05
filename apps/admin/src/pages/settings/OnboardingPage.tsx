import { BRAND_FONT, DEFAULT_BRAND_COLORS, fmtIdr, newId, nowIso, plural, slugify } from '@rc/fixtures'
import {
  BRAND_PERSONALITY_LABEL,
  type BrandConfig,
  type BrandPersonality,
  COURIER_LABEL,
  type Courier,
  DEVICE_LABEL,
  type Device,
  INDUSTRY_LABEL,
  type Industry,
  PAYMENT_METHOD_LABEL,
  type PageSection,
  type PaymentMethod,
  SECTION_KIND_LABEL,
  type SectionKind,
  TENANT_PLAN_LABEL,
  TONE_OF_VOICE_LABEL,
  type Template,
  type Tenant,
  type TenantPlan,
  type ToneOfVoice,
} from '@rc/types'
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  FormField,
  IconTile,
  Input,
  KeyValue,
  NativeSelect,
  PageHeader,
  SegmentedControl,
  Steps,
  Switch,
  Textarea,
  cn,
  toast,
} from '@rc/ui'
import { Check, FileSpreadsheet, PackageOpen, Square } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/auth'
import { StorefrontPreview } from '../../components/StorefrontPreview'
import { useScoped } from '../../state/scoped'
import {
  ONBOARDING_STEPS,
  SUBDOMAIN_PATTERN,
  WIZARD_COURIERS,
  WIZARD_PAYMENTS,
  invalidEmails,
  parseEmails,
  tenantCode,
} from './lib'

const STEPS = [
  { key: 'business', label: 'Business' },
  { key: 'brand', label: 'Brand' },
  { key: 'template', label: 'Template' },
  { key: 'commerce', label: 'Payment & shipping' },
  { key: 'products', label: 'Products & team' },
  { key: 'review', label: 'Review & publish' },
] as const
type StepKey = (typeof STEPS)[number]['key']

type Catalog = 'csv' | 'sample' | 'empty'
const CATALOG: { value: Catalog; title: string; body: string; icon: ReactNode }[] = [
  {
    value: 'csv',
    title: 'Import a CSV later',
    body: 'Upload the catalog from Products once the tenant exists.',
    icon: <FileSpreadsheet />,
  },
  {
    value: 'sample',
    title: 'Start from sample products',
    body: 'Six placeholder products to design the store with. Replace them before launch.',
    icon: <PackageOpen />,
  },
  {
    value: 'empty',
    title: 'Start empty',
    body: 'No products yet. The team adds them one by one.',
    icon: <Square />,
  },
]

interface Draft {
  name: string
  industry: Industry | ''
  plan: TenantPlan
  subdomain: string
  subdomainEdited: boolean
  colors: { primary: string; secondary: string; accent: string }
  personality: BrandPersonality
  tone: ToneOfVoice
  tagline: string
  templateId: string | null
  payments: PaymentMethod[]
  couriers: Courier[]
  freeShippingMin: string
  catalog: Catalog | null
  invites: string
  publish: boolean
}

const INITIAL: Draft = {
  name: '',
  industry: '',
  plan: 'growth',
  subdomain: '',
  subdomainEdited: false,
  colors: {
    primary: DEFAULT_BRAND_COLORS.primary,
    secondary: DEFAULT_BRAND_COLORS.secondary,
    accent: DEFAULT_BRAND_COLORS.accent,
  },
  personality: 'modern',
  tone: 'friendly',
  tagline: '',
  templateId: null,
  payments: ['qris', 'va', 'ewallet'],
  couriers: ['jne', 'sicepat'],
  freeShippingMin: '500000',
  catalog: null,
  invites: '',
  publish: false,
}

const DEFAULT_LOCKS: BrandConfig['locks'] = {
  logo: true,
  primary_color: true,
  button_style: true,
  hero_image: false,
  headline: false,
  featured_product: false,
  layout: false,
}

const toggle = <T,>(list: readonly T[], item: T) =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item]

export function OnboardingPage() {
  const { can } = useAuth()
  if (!can('tenant.manage')) {
    return (
      <>
        <PageHeader title="New tenant" description="Set up a new brand on the platform." />
        <Card>
          <EmptyState
            title="A platform admin creates tenants"
            description="Ask your platform admin to set up a new brand. You can open the brands you belong to from Tenants."
          />
        </Card>
      </>
    )
  }
  return <Wizard />
}

function Wizard() {
  const s = useScoped()
  const { switchTenant } = useAuth()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft>(INITIAL)
  const [step, setStep] = useState(0)
  const [tried, setTried] = useState<ReadonlySet<StepKey>>(new Set())
  const [created, setCreated] = useState<Tenant | null>(null)
  const [device, setDevice] = useState<Device>('desktop')

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const storeTemplates = useMemo(() => s.templates.filter((t) => t.scope === 'store'), [s.templates])
  const template = storeTemplates.find((t) => t.id === draft.templateId) ?? null
  const takenSubdomains = useMemo(() => new Set(s.state.tenants.map((t) => t.subdomain)), [s.state.tenants])
  const emails = parseEmails(draft.invites)

  const stepKey = STEPS[step]!.key
  const errors = stepErrors(stepKey, draft, takenSubdomains, emails)
  const showErrors = tried.has(stepKey)
  const err = (field: string) => (showErrors ? errors[field] : undefined)
  const errorCount = Object.keys(errors).length

  const previewSections = useMemo<PageSection[]>(
    () =>
      (template?.sections ?? []).map((sec, i) => ({
        id: `preview-${i}`,
        kind: sec.kind,
        rule: sec.rule,
        hidden: false,
        headline: placeholderHeadline(sec.kind, draft.name || 'Your store', draft.tagline),
        body: 'Placeholder copy. Your team replaces it before launch.',
        productIds: [],
        ctaLabel: 'Shop now',
      })),
    [template, draft.name, draft.tagline],
  )
  const previewBrand: BrandConfig = {
    colors: { ...draft.colors, background: DEFAULT_BRAND_COLORS.background, text: DEFAULT_BRAND_COLORS.text },
    fonts: { heading: BRAND_FONT, body: BRAND_FONT },
    // A new store starts on Theme 1; Brand guideline switches it.
    theme: 'theme1',
    radius: 'soft',
    buttonStyle: 'solid',
    personality: draft.personality,
    tone: draft.tone,
    tagline: draft.tagline,
    locks: DEFAULT_LOCKS,
  }

  const next = () => {
    setTried((t) => new Set(t).add(stepKey))
    if (errorCount) return
    if (step < STEPS.length - 1) {
      setStep(step + 1)
      return
    }
    finish()
  }

  const finish = () => {
    const completed = ['business', 'brand', 'template', 'commerce', 'payment', 'shipping']
    if (draft.catalog === 'sample') completed.push('products')
    if (emails.length) completed.push('users')
    completed.push('preview')
    if (draft.publish) completed.push('publish')
    const tenant: Tenant = {
      id: newId('ten'),
      code: tenantCode(
        draft.name,
        s.state.tenants.map((t) => t.code),
      ),
      name: draft.name.trim(),
      industry: draft.industry as Industry,
      plan: draft.plan,
      subdomain: draft.subdomain,
      domain: null,
      domainVerified: false,
      createdAt: nowIso(),
      brand: { ...previewBrand, tagline: draft.tagline.trim() },
      loyalty: {
        pointsPer10k: 1,
        thresholds: { silver: 1_500_000, gold: 5_000_000, platinum: 10_000_000 },
        freeShippingMin: Number(draft.freeShippingMin),
      },
      onboarding: ONBOARDING_STEPS.map((x) => x.key).filter((k) => completed.includes(k)),
    }
    s.dispatch({ type: 'tenants/create', tenant })
    toast('Tenant created', {
      tone: 'success',
      description: `${tenant.name} · ${tenant.subdomain}.commerceos.id`,
    })
    setCreated(tenant)
  }

  if (created) {
    const remaining = ONBOARDING_STEPS.length - created.onboarding.length
    return (
      <div className="max-w-5xl mx-auto w-full">
        <h1 className="sr-only">New tenant</h1>
        <Card variant="ink" className="p-6 sm:p-8">
          <IconTile tone="success" size="lg" shape="round">
            <Check />
          </IconTile>
          <h2 className="mt-5 text-2xl font-bold tracking-tight">{created.name} is set up</h2>
          <p className="mt-2 max-w-xl text-sm text-on-ink-muted">
            {created.subdomain}.commerceos.id{' '}
            {created.onboarding.includes('publish')
              ? 'is live'
              : 'stays unpublished until the team publishes it'}
            .{' '}
            {remaining
              ? `${plural(remaining, 'setup step')} left, shown on the tenant card.`
              : 'Every setup step is done.'}
            {emails.length ? ` Invites went to ${plural(emails.length, 'person', 'people')}.` : ''}
          </p>
          <div className="mt-6 gap-2 flex flex-wrap">
            <Button
              onClick={() => {
                switchTenant(created.id)
                navigate('/')
              }}
            >
              Open {created.name}
            </Button>
            <Button asChild variant="onInk">
              <Link to="/settings/tenants">Back to tenants</Link>
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto w-full">
      <PageHeader
        title="New tenant"
        description="Six steps from a business name to a store preview. Everything here can change later in Brand, Store and Settings."
        actions={
          <Button asChild variant="ghost">
            <Link to="/settings/tenants">Cancel</Link>
          </Button>
        }
      />
      <div className="space-y-4">
        <Steps
          steps={STEPS.map((st, i) => ({
            key: st.key,
            label: st.label,
            state: i < step ? 'done' : i === step ? 'current' : 'upcoming',
          }))}
        />

        <Card className="p-6">
          {stepKey === 'business' && (
            <StepBody
              title="Tell us about the business"
              lead="The name and subdomain appear on the store and in every email."
            >
              <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
                <FormField label="Business name" required error={err('name')}>
                  <Input
                    value={draft.name}
                    placeholder="Lari Running Co."
                    onChange={(e) => {
                      const name = e.target.value
                      setDraft((d) => ({
                        ...d,
                        name,
                        subdomain: d.subdomainEdited ? d.subdomain : slugify(name).slice(0, 30),
                      }))
                    }}
                  />
                </FormField>
                <FormField
                  label="Industry"
                  required
                  error={err('industry')}
                  hint="Picks starting categories and sample products."
                >
                  <NativeSelect
                    value={draft.industry}
                    placeholder="Choose an industry"
                    options={Object.entries(INDUSTRY_LABEL).map(([value, label]) => ({ value, label }))}
                    onChange={(e) => set('industry', e.target.value as Industry)}
                  />
                </FormField>
                <FormField label="Plan" required hint="Growth includes personal stores and automations.">
                  <NativeSelect
                    value={draft.plan}
                    options={Object.entries(TENANT_PLAN_LABEL).map(([value, label]) => ({ value, label }))}
                    onChange={(e) => set('plan', e.target.value as TenantPlan)}
                  />
                </FormField>
                <FormField
                  label="Subdomain"
                  required
                  error={err('subdomain')}
                  hint={
                    draft.subdomain
                      ? takenSubdomains.has(draft.subdomain)
                        ? `${draft.subdomain}.commerceos.id is taken.`
                        : `${draft.subdomain}.commerceos.id is free. A custom domain can follow later.`
                      : 'Filled in from the business name.'
                  }
                >
                  <Input
                    value={draft.subdomain}
                    inputClassName="font-mono"
                    rightSlot={<span className="pr-2 text-xs">.commerceos.id</span>}
                    className="[&_input]:pr-32"
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        subdomain: e.target.value.toLowerCase().trim(),
                        subdomainEdited: true,
                      }))
                    }
                  />
                </FormField>
              </div>
            </StepBody>
          )}

          {stepKey === 'brand' && (
            <StepBody
              title="Set the brand basics"
              lead="Templates read these tokens, so every page and personal store stays on brand."
            >
              <div className="gap-4 sm:grid-cols-3 grid grid-cols-1">
                {(['primary', 'secondary', 'accent'] as const).map((key) => (
                  <ColourField
                    key={key}
                    label={`${key[0]!.toUpperCase()}${key.slice(1)} colour`}
                    value={draft.colors[key]}
                    onChange={(v) => set('colors', { ...draft.colors, [key]: v })}
                  />
                ))}
              </div>
              <div className="mt-4 gap-4 sm:grid-cols-2 grid grid-cols-1">
                <FormField
                  label="Tagline"
                  required
                  error={err('tagline')}
                  hint="One line under the logo and in the hero."
                  className="sm:col-span-2"
                >
                  <Input
                    value={draft.tagline}
                    placeholder="Gear for every kilometre."
                    onChange={(e) => set('tagline', e.target.value)}
                  />
                </FormField>
              </div>
              <ChipGroup label="Personality">
                {(Object.keys(BRAND_PERSONALITY_LABEL) as BrandPersonality[]).map((p) => (
                  <Chip key={p} active={draft.personality === p} onClick={() => set('personality', p)}>
                    {BRAND_PERSONALITY_LABEL[p]}
                  </Chip>
                ))}
              </ChipGroup>
              <ChipGroup label="Tone of voice">
                {(Object.keys(TONE_OF_VOICE_LABEL) as ToneOfVoice[]).map((t) => (
                  <Chip key={t} active={draft.tone === t} onClick={() => set('tone', t)}>
                    {TONE_OF_VOICE_LABEL[t]}
                  </Chip>
                ))}
              </ChipGroup>
              <p className="mt-4 text-xs text-muted">
                Logo, primary colour, fonts and button style start locked, so sellers and campaign pages keep
                them.
              </p>
            </StepBody>
          )}

          {stepKey === 'template' && (
            <StepBody
              title="Choose the store template"
              lead="The template sets the section order of the homepage. Content stays separate and moves with you if you switch."
            >
              <div className="gap-3 md:grid-cols-2 grid grid-cols-1">
                {storeTemplates.map((t) => (
                  <TemplateOption
                    key={t.id}
                    template={t}
                    selected={draft.templateId === t.id}
                    onSelect={() => set('templateId', t.id)}
                  />
                ))}
              </div>
              {err('template') && <p className="mt-3 text-sm text-danger">{err('template')}</p>}
            </StepBody>
          )}

          {stepKey === 'commerce' && (
            <StepBody
              title="Payment and shipping"
              lead="Customers see these options at checkout. Gateways and couriers connect in Integrations."
            >
              <p className="text-sm font-medium">Payment methods</p>
              <div className="mt-2 gap-2 sm:grid-cols-2 grid grid-cols-1">
                {WIZARD_PAYMENTS.map((m) => (
                  <label
                    key={m}
                    className="min-h-12 gap-3 rounded-2xl px-4 py-2 text-sm flex items-center justify-between bg-surface-2"
                  >
                    {PAYMENT_METHOD_LABEL[m]}
                    <Switch
                      checked={draft.payments.includes(m)}
                      onCheckedChange={() => set('payments', toggle(draft.payments, m))}
                    />
                  </label>
                ))}
              </div>
              {err('payments') && <p className="mt-2 text-xs text-danger">{err('payments')}</p>}
              <ChipGroup label="Couriers">
                {WIZARD_COURIERS.map((c) => (
                  <Chip
                    key={c}
                    active={draft.couriers.includes(c)}
                    onClick={() => set('couriers', toggle(draft.couriers, c))}
                  >
                    {COURIER_LABEL[c]}
                  </Chip>
                ))}
              </ChipGroup>
              {err('couriers') && <p className="mt-2 text-xs text-danger">{err('couriers')}</p>}
              <FormField
                label="Free shipping from"
                required
                className="mt-4 sm:max-w-xs"
                error={err('freeShippingMin')}
                hint={
                  Number(draft.freeShippingMin) > 0
                    ? `Orders of ${fmtIdr(Number(draft.freeShippingMin))} or more ship free.`
                    : 'Use 0 to always charge shipping.'
                }
              >
                <Input
                  inputMode="numeric"
                  value={draft.freeShippingMin}
                  leftIcon={<span className="text-xs font-semibold">Rp</span>}
                  inputClassName="tabular-nums"
                  onChange={(e) => set('freeShippingMin', e.target.value.replace(/[^\d]/g, ''))}
                />
              </FormField>
            </StepBody>
          )}

          {stepKey === 'products' && (
            <StepBody
              title="Products and team"
              lead="Decide how the catalog starts and who joins the console."
            >
              <div
                className="gap-3 md:grid-cols-3 grid grid-cols-1"
                role="radiogroup"
                aria-label="How the catalog starts"
              >
                {CATALOG.map((c) => {
                  const active = draft.catalog === c.value
                  return (
                    <button
                      key={c.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => set('catalog', c.value)}
                      className={cn(
                        'rounded-2xl p-4 flex flex-col items-start bg-surface-2 text-left transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
                        active && 'bg-card shadow-card ring-2 ring-ink hover:bg-card',
                      )}
                    >
                      <IconTile tone={active ? 'ink' : 'default'}>{c.icon}</IconTile>
                      <span className="mt-3 text-sm font-semibold">{c.title}</span>
                      <span className="mt-1 text-xs text-muted">{c.body}</span>
                    </button>
                  )
                })}
              </div>
              {err('catalog') && <p className="mt-2 text-xs text-danger">{err('catalog')}</p>}
              <FormField
                label="Invite the team"
                className="mt-5"
                error={err('invites')}
                hint={
                  emails.length
                    ? `${plural(emails.length, 'invite')} go out as tenant admins once the tenant exists.`
                    : 'Optional. One email per line or separated by commas.'
                }
              >
                <Textarea
                  value={draft.invites}
                  placeholder={'andi@brand.co.id\nmaya@brand.co.id'}
                  onChange={(e) => set('invites', e.target.value)}
                />
              </FormField>
            </StepBody>
          )}

          {stepKey === 'review' && (
            <StepBody
              title="Review and publish"
              lead="Check the summary and the homepage preview. Nothing is created until you press Create tenant."
            >
              <div className="gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] grid grid-cols-1">
                <div className="min-w-0 space-y-4">
                  <KeyValue
                    bare
                    labelWidth="md"
                    items={[
                      { label: 'Business', value: draft.name },
                      { label: 'Industry', value: draft.industry ? INDUSTRY_LABEL[draft.industry] : 'None' },
                      { label: 'Plan', value: TENANT_PLAN_LABEL[draft.plan] },
                      {
                        label: 'Store address',
                        value: <span className="text-xs font-mono">{draft.subdomain}.commerceos.id</span>,
                      },
                      { label: 'Template', value: template?.name ?? 'None' },
                      { label: 'Font', value: BRAND_FONT },
                      {
                        label: 'Voice',
                        value: `${BRAND_PERSONALITY_LABEL[draft.personality]}, ${TONE_OF_VOICE_LABEL[draft.tone].toLowerCase()}`,
                      },
                      {
                        label: 'Payments',
                        value: draft.payments.map((m) => PAYMENT_METHOD_LABEL[m]).join(', '),
                      },
                      { label: 'Couriers', value: draft.couriers.map((c) => COURIER_LABEL[c]).join(', ') },
                      {
                        label: 'Free shipping',
                        value:
                          Number(draft.freeShippingMin) > 0
                            ? `From ${fmtIdr(Number(draft.freeShippingMin))}`
                            : 'Never',
                      },
                      {
                        label: 'Catalog',
                        value: CATALOG.find((c) => c.value === draft.catalog)?.title ?? 'None',
                      },
                      {
                        label: 'Invites',
                        value: emails.length ? plural(emails.length, 'person', 'people') : 'None',
                      },
                    ]}
                  />
                  <label className="gap-3 rounded-2xl px-4 py-3 text-sm flex items-center justify-between bg-surface-2">
                    <span className="min-w-0">
                      <span className="font-medium block">Publish the store now</span>
                      <span className="text-xs block text-muted">
                        {draft.catalog === 'sample'
                          ? 'The homepage goes live with the sample products.'
                          : 'Add products first. The store can be published from Store pages later.'}
                      </span>
                    </span>
                    <Switch
                      checked={draft.publish}
                      disabled={draft.catalog !== 'sample'}
                      onCheckedChange={(v) => set('publish', v)}
                    />
                  </label>
                </div>
                <div className="min-w-0">
                  <div className="mb-3 gap-2 flex flex-wrap items-center justify-between">
                    <p className="text-sm font-medium">Homepage preview</p>
                    <SegmentedControl
                      size="sm"
                      aria-label="Preview device"
                      value={device}
                      onChange={(v) => setDevice(v === 'mobile' ? 'mobile' : 'desktop')}
                      options={(['desktop', 'mobile'] as const).map((d) => ({
                        value: d,
                        label: DEVICE_LABEL[d],
                      }))}
                    />
                  </div>
                  <StorefrontPreview
                    brand={previewBrand}
                    storeName={draft.name || 'Your store'}
                    sections={previewSections}
                    device={device}
                    products={new Map()}
                    className="rounded-2xl overflow-hidden bg-surface-2"
                  />
                </div>
              </div>
            </StepBody>
          )}
        </Card>

        <div className="gap-2 flex flex-wrap items-center justify-between">
          {step > 0 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : (
            <span />
          )}
          <div className="gap-3 flex flex-wrap items-center justify-end">
            {showErrors && errorCount > 0 && (
              <p className="text-sm text-danger">
                {plural(errorCount, 'field needs', 'fields need')} attention.
              </p>
            )}
            <Button onClick={next}>{step === STEPS.length - 1 ? 'Create tenant' : 'Continue'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

type Errors = Partial<Record<string, string>>

function stepErrors(
  key: StepKey,
  draft: Draft,
  takenSubdomains: ReadonlySet<string>,
  emails: readonly string[],
): Errors {
  const e: Errors = {}
  if (key === 'business') {
    if (!draft.name.trim()) e.name = 'Enter the business name.'
    if (!draft.industry) e.industry = 'Choose the industry.'
    if (!SUBDOMAIN_PATTERN.test(draft.subdomain))
      e.subdomain =
        'Use 3 to 30 lowercase letters, numbers or dashes, starting and ending with a letter or number.'
    else if (takenSubdomains.has(draft.subdomain))
      e.subdomain = `${draft.subdomain} is taken. Pick another subdomain.`
  }
  if (key === 'brand') {
    if (!draft.tagline.trim()) e.tagline = 'Write a one-line tagline for the store.'
  }
  if (key === 'template' && !draft.templateId) e.template = 'Choose a store template.'
  if (key === 'commerce') {
    if (!draft.payments.length) e.payments = 'Turn on at least one payment method.'
    if (!draft.couriers.length) e.couriers = 'Pick at least one courier or store pickup.'
    const min = Number(draft.freeShippingMin)
    if (draft.freeShippingMin.trim() === '' || !Number.isFinite(min) || min < 0)
      e.freeShippingMin = 'Enter an amount of 0 or more. Use 0 to always charge shipping.'
  }
  if (key === 'products') {
    if (!draft.catalog) e.catalog = 'Choose how the catalog starts.'
    const bad = invalidEmails(emails)
    if (bad.length) e.invites = `Check ${bad.join(', ')}: each invite needs a full email address.`
  }
  return e
}

function placeholderHeadline(kind: SectionKind, name: string, tagline: string) {
  if (kind === 'hero') return tagline.trim() || `Welcome to ${name}`
  if (kind === 'footer') return name
  return SECTION_KIND_LABEL[kind]
}

function StepBody({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{lead}</p>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-4" role="group" aria-label={label}>
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-2 gap-2 flex flex-wrap">{children}</div>
    </div>
  )
}

function ColourField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <FormField label={label}>
      <div className="h-11 gap-3 rounded-2xl px-2 flex items-center border border-border bg-card">
        {/* Tenant brand colour: storefront data. */}
        <input
          type="color"
          value={value}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          className="size-8 rounded-lg p-0 shrink-0 cursor-pointer border-0 bg-transparent"
        />
        <span className="text-xs font-mono uppercase">{value}</span>
      </div>
    </FormField>
  )
}

function TemplateOption({
  template,
  selected,
  onSelect,
}: {
  template: Template
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'rounded-2xl p-4 flex flex-col items-start bg-surface-2 text-left transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
        selected && 'bg-card shadow-card ring-2 ring-ink hover:bg-card',
      )}
    >
      <span className="gap-2 flex w-full items-start justify-between">
        <span className="text-sm font-semibold">{template.name}</span>
        {selected && <Badge variant="ink">Chosen</Badge>}
      </span>
      <span className="mt-1 text-xs text-muted">{template.description}</span>
      <span className="mt-1 text-xs">
        <span className="text-muted">Best for</span> {template.bestFor}
      </span>
      <span className="mt-3 gap-1 flex flex-wrap">
        {template.sections.map((sec, i) => (
          <span key={i} className="px-2 py-0.5 rounded-full bg-card text-[0.6875rem] text-body">
            {SECTION_KIND_LABEL[sec.kind]}
          </span>
        ))}
      </span>
    </button>
  )
}
