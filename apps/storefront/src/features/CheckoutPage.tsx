import { addedTax, availablePaymentTypes, fmtIdr, nowMs, orderPlaceBlocker } from '@rc/fixtures'
import type { Courier, LoyaltyTier, PaymentMethod, PaymentType } from '@rc/types'
import { cn } from '@rc/ui'
import {
  Banknote,
  CalendarClock,
  Check,
  CreditCard,
  Landmark,
  type LucideIcon,
  QrCode,
  ShoppingBag,
  Wallet,
} from 'lucide-react'
import { type FormEvent, type ReactNode, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { SummaryRows } from '../components/cartParts'
import { TermsConsent, termsRequired } from '../components/TermsConsent'
import { ProductImage } from '../components/product'
import { Button, ButtonLink, EmptyState, Field, describedBy, inputClass } from '../components/ui'
import { ApiError } from '@rc/api'
import { HTTP } from '../lib/api'
import { cartTotals } from '../lib/cart'
import {
  demoPaymentNote,
  CITIES,
  couriersFor,
  defaultCourierFor,
  EMAIL_PATTERN,
  PHONE_PATTERN,
  buildOrder,
  cartTax,
  courierFee,
  withTerms,
} from '../lib/checkout'
import { paths } from '../lib/paths'
import { useTitle } from '../lib/useTitle'
import { useShop } from '../state/shop'
import { useStore } from '../state/store'
import { PayInRupiahNote } from '../components/Money'
import { RupiahOnlyArea } from '../state/currency'
import { problemText, refusalText } from '../i18n/refusals'
import { MARKETING_CONSENT_VERSION } from '@rc/types'
import { type MessageKey, t, tp, tx } from '../i18n'
import { codeErrorText, describePromotion } from '../i18n/format'

const STEP_KEYS: MessageKey[] = [
  'checkout.step.contact',
  'checkout.step.delivery',
  'checkout.step.payment',
  'checkout.step.review',
]
const stepName = (i: number) => t(STEP_KEYS[i]!)

const TIER_KEY: Record<LoyaltyTier, MessageKey> = {
  member: 'checkout.tier.member',
  silver: 'checkout.tier.silver',
  gold: 'checkout.tier.gold',
  platinum: 'checkout.tier.platinum',
}

const METHOD_ICON: Record<PaymentMethod, LucideIcon> = {
  qris: QrCode,
  va: Landmark,
  bank_transfer: Landmark,
  ewallet: Wallet,
  credit_card: CreditCard,
  paylater: CalendarClock,
  cod: Banknote,
}

type Errors = Partial<Record<'name' | 'email' | 'phone' | 'lookup' | 'city' | 'address' | 'payment', string>>

/** Phones: "Step 2 of 4 · Delivery" over a thin progress bar. */
function StepProgress({ step }: { step: number }) {
  return (
    <div className="md:hidden w-full">
      <p className="text-sm font-semibold">
        {t('checkout.stepOf', { n: step + 1, total: STEP_KEYS.length, name: stepName(step) })}
      </p>
      <div aria-hidden="true" className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--sf-line)]">
        <div
          className="h-full rounded-full bg-[var(--sf-text)] transition-[width]"
          style={{ width: `${((step + 1) / STEP_KEYS.length) * 100}%` }}
        />
      </div>
    </div>
  )
}

function Stepper({ step, onBack }: { step: number; onBack: (i: number) => void }) {
  return (
    <ol className="min-w-0 gap-2 md:flex no-scrollbar hidden overflow-x-auto" aria-label={t('checkout.steps')}>
      {STEP_KEYS.map((key, i) => {
        const label = t(key)
        const done = i < step
        const current = i === step
        const content = (
          <>
            <span
              className={cn(
                'size-7 text-xs font-bold flex shrink-0 items-center justify-center rounded-full',
                done || current
                  ? 'bg-[var(--sf-text)] text-[color:var(--sf-bg)]'
                  : 'border border-[color:var(--sf-line)] text-[color:var(--sf-muted)]',
              )}
            >
              {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
            </span>
            <span
              className={cn(
                'text-sm font-semibold whitespace-nowrap',
                !current && !done && 'text-[color:var(--sf-muted)]',
              )}
            >
              {label}
              {done && <span className="sr-only">{t('checkout.stepDone')}</span>}
            </span>
          </>
        )
        return (
          <li
            key={label}
            className="gap-2 flex shrink-0 items-center"
            aria-current={current ? 'step' : undefined}
          >
            {i > 0 && <span aria-hidden="true" className="w-6 h-px bg-[var(--sf-line)]" />}
            {done ? (
              <button
                type="button"
                onClick={() => onBack(i)}
                className="min-h-11 gap-2 pr-2 flex items-center rounded-full hover:underline"
              >
                {content}
              </button>
            ) : (
              <span className="min-h-11 gap-2 flex items-center">{content}</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** A deterministic fake QR pattern for the simulated QRIS payment. */
function FakeQr({ seed }: { seed: string }) {
  const n = 21
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  const cells: [number, number][] = []
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const finder = (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7)
      if (finder) {
        const fx = x < 7 ? x : x - (n - 7)
        const fy = y < 7 ? y : y - (n - 7)
        const ring = Math.max(Math.abs(fx - 3), Math.abs(fy - 3))
        if (ring !== 2) cells.push([x, y])
        continue
      }
      h = Math.imul(h ^ (x * 31 + y), 2654435761) >>> 0
      if (h % 3 === 0) cells.push([x, y])
    }
  return (
    <svg
      viewBox={`-1 -1 ${n + 2} ${n + 2}`}
      className="size-44 bg-white text-black"
      role="img"
      aria-label={t('checkout.qrisLabel')}
    >
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
      ))}
    </svg>
  )
}

function Choice({
  name,
  checked,
  onChange,
  disabled,
  icon,
  title,
  note,
  aside,
  children,
}: {
  name: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
  icon?: ReactNode
  title: string
  note?: ReactNode
  aside?: ReactNode
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--sf-tile-radius)] border transition',
        checked
          ? 'border-[color:var(--sf-text)] ring-1 ring-[color:var(--sf-text)]'
          : 'border-[color:var(--sf-line)]',
        disabled && 'opacity-50',
      )}
    >
      <label
        className={cn(
          'min-h-14 gap-3 px-4 py-3 flex cursor-pointer items-center',
          disabled && 'cursor-not-allowed',
        )}
      >
        <input
          type="radio"
          name={name}
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="size-4 shrink-0 accent-[var(--sf-primary)]"
        />
        {icon && <span className="[&_svg]:size-5 shrink-0">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="text-sm font-semibold block">{title}</span>
          {note && <span className="text-xs block text-[color:var(--sf-muted)]">{note}</span>}
        </span>
        {aside && <span className="text-sm font-semibold shrink-0 text-right">{aside}</span>}
      </label>
      {checked && children && (
        <div className="px-4 py-4 border-t border-[color:var(--sf-line)]">{children}</div>
      )}
    </div>
  )
}

export function CheckoutPage() {
  const { state } = useStore()
  const shop = useShop()
  const { catalog, cart, customer, customers, referral, store, tenant, send, signIn, paysOnline, reloadStore } = shop
  const navigate = useNavigate()
  const uid = useId()
  useTitle(t('checkout.pageTitle', { store: tenant.name }))

  const [step, setStep] = useState(0)
  const previousStep = useRef(step)
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const [mode, setMode] = useState<'guest' | 'account'>(customer ? 'account' : 'guest')
  const [contact, setContact] = useState({ name: '', email: '', phone: '' })
  const [lookup, setLookup] = useState(customer?.email ?? '')
  const [accountId, setAccountId] = useState<string | null>(customer?.id ?? null)
  const account = customers.find((c) => c.id === accountId) ?? null
  const [city, setCity] = useState<string>(
    customer && (CITIES as readonly string[]).includes(customer.city) ? customer.city : '',
  )
  const [address, setAddress] = useState('')
  const availableCouriers = couriersFor(tenant)
  const firstCourier = defaultCourierFor(tenant)
  const [courierId, setCourierId] = useState<Courier>(firstCourier.id)
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  // Kept as a function so the message follows the language when the shopper switches it.
  const [placeError, setPlaceError] = useState<{ text: () => string } | null>(null)
  const [agreed, setAgreed] = useState(false)
  // Marketing consent is optional and starts unticked (UU PDP Pasal 20 to 24).
  const [offers, setOffers] = useState(false)

  useLayoutEffect(() => {
    if (previousStep.current === step) return
    previousStep.current = step
    window.scrollTo(0, 0)
    stepHeading.current?.focus({ preventScroll: true })
  }, [step])

  const totals = useMemo(
    () => cartTotals(catalog, cart.cart, referral?.id ?? null, nowMs(), paymentId),
    [catalog, cart.cart, referral, paymentId],
  )
  const courier = availableCouriers.find((c) => c.id === courierId) ?? firstCourier
  const shipping = courierFee(courier, totals.freeShipping)
  const tax = useMemo(() => cartTax(tenant, totals), [tenant, totals])
  const total = Math.max(0, totals.subtotal - totals.discount + addedTax(tax) + shipping)
  const payable = availablePaymentTypes(
    catalog.paymentTypes,
    shop.totals.subtotal - shop.totals.discount + shipping,
  )
  const payment: PaymentType | null = payable.find((t) => t.id === paymentId) ?? null
  const pickup = catalog.warehouses[0]
  const demo = useMemo(() => {
    const pick = (fn: (c: (typeof customers)[number]) => boolean) => customers.find(fn)
    return [
      pick((c) => c.stage === 'vip'),
      pick((c) => c.tier === 'gold' && c.stage !== 'vip'),
      pick((c) => c.stage === 'repeat_buyer'),
    ].filter((c): c is NonNullable<typeof c> => !!c)
  }, [customers])

  if (!totals.items.length)
    return (
      <div className="max-w-xl space-y-6 md:pt-12 mx-auto">
        <h1 className="sf-display text-3xl font-bold">{t('checkout.title')}</h1>
        <EmptyState
          icon={<ShoppingBag aria-hidden="true" />}
          title={t('checkout.cart.empty')}
          text={t('checkout.emptyText')}
          action={<ButtonLink to={paths.home(store)}>{t('checkout.cart.startShopping')}</ButtonLink>}
        />
      </div>
    )

  const findAccount = (email: string) => {
    const match = customers.find((c) => c.email.toLowerCase() === email.trim().toLowerCase())
    setAccountId(match?.id ?? null)
    setErrors((e) => ({
      ...e,
      lookup: match ? undefined : t('checkout.error.noAccount'),
    }))
    if (match && (CITIES as readonly string[]).includes(match.city) && !city) setCity(match.city)
  }

  const validate = (s: number): Errors => {
    const e: Errors = {}
    if (s === 0) {
      if (mode === 'account') {
        if (!account) e.lookup = t('checkout.error.findAccount')
      } else {
        if (!contact.name.trim()) e.name = t('checkout.error.name')
        if (!EMAIL_PATTERN.test(contact.email.trim()))
          e.email = t('checkout.error.email')
        if (!PHONE_PATTERN.test(contact.phone.trim()))
          e.phone = t('checkout.error.phone')
      }
    }
    if (s === 1) {
      if (!city) e.city = t('checkout.error.city')
      if (courier.id !== 'pickup' && address.trim().length < 8)
        e.address = t('checkout.error.address')
    }
    if (s === 2) {
      if (!payment) e.payment = t('checkout.error.payment')
    }
    return e
  }

  const next = (e: FormEvent) => {
    e.preventDefault()
    const found = validate(step)
    setErrors(found)
    if (Object.values(found).some(Boolean)) return
    setStep((s) => Math.min(3, s + 1))
  }

  const place = () => {
    if (!payment) return
    if (!agreed) {
      setPlaceError({ text: termsRequired })
      return
    }
    const contactInfo =
      mode === 'account' && account
        ? { name: account.name, email: account.email, phone: account.phone }
        : contact
    const existing =
      account ?? customers.find((c) => c.email.toLowerCase() === contact.email.trim().toLowerCase()) ?? null
    const { order, customer: created } = buildOrder({
      catalog,
      totals,
      stock: state.stock,
      modifierStock: state.modifierStock,
      orderCodes: state.orders.map((o) => o.code),
      customerCodes: state.customers.map((c) => c.code),
      customer: existing,
      contact: contactInfo,
      sellerId: referral?.id ?? null,
      city,
      courier,
      payment,
    })
    const blocker = orderPlaceBlocker(
      order,
      state.stock,
      state.modifierStock,
      state.modifiers,
      state.products,
    )
    if (blocker) {
      setPlaceError({ text: () => refusalText(blocker) })
      return
    }
    send({ type: 'orders/place', order: withTerms(order, tenant, catalog.paymentTypes), customer: created })
      .then(async (answer) => {
        await signIn(order.customerId)
        // Someone who already agreed is refused as unchanged, which changes nothing here.
        if (offers)
          await send({
            type: 'customers/setConsent',
            id: order.customerId,
            granted: true,
            source: 'checkout',
            textVersion: MARKETING_CONSENT_VERSION,
          }).catch(() => undefined)
        cart.clear()
        // The provider's page takes the payment and sends the shopper back to the order page.
        if (answer?.payment) window.location.assign(answer.payment.redirectUrl)
        else navigate(paths.order(store, order.id), { replace: true })
      })
      .catch((err: unknown) => {
        // The store changed its terms (or the payment types they list) since this page loaded: read
        // them again and ask for a fresh agreement.
        if (err instanceof ApiError && err.code === 'TERMS_NOT_ACCEPTED') {
          reloadStore()
          setAgreed(false)
          setPlaceError({ text: () => t('checkout.terms.changed') })
          return
        }
        setPlaceError({ text: () => problemText(err) })
      })
  }

  const field = (key: keyof typeof contact) => ({
    id: `${uid}-${key}`,
    value: contact[key],
    onChange: (e: { target: { value: string } }) => setContact((c) => ({ ...c, [key]: e.target.value })),
    className: inputClass,
    ...describedBy(`${uid}-${key}`, errors[key]),
  })
  const vaDigits = ((mode === 'account' ? account?.phone : contact.phone) ?? '')
    .replace(/\D/g, '')
    .slice(-10)
    .padStart(10, '0')
  const offersFor = (typeId: string) =>
    shop.totals.paymentOffers
      .filter((p) => p.paymentTypeIds.includes(typeId))
      .map((p) => describePromotion(p))

  return (
    <div className="space-y-6 md:pt-12">
      <div className="gap-3 flex flex-wrap items-center justify-between">
        <h1 className="sf-display text-3xl font-bold">{t('checkout.title')}</h1>
        <StepProgress step={step} />
        <Stepper step={step} onBack={setStep} />
      </div>
      <div className="gap-6 lg:grid-cols-[minmax(0,1fr)_380px] grid grid-cols-1">
        <form onSubmit={next} noValidate className="sf-card min-w-0 space-y-6 p-5 md:p-6">
          <h2 ref={stepHeading} tabIndex={-1} className="sf-display text-2xl font-bold">
            {step + 1}. {stepName(step)}
          </h2>

          {step === 0 && (
            <>
              <fieldset className="gap-2 sm:grid-cols-2 grid grid-cols-1">
                <legend className="sr-only">{t('checkout.mode.legend')}</legend>
                <Choice
                  name="mode"
                  checked={mode === 'guest'}
                  onChange={() => setMode('guest')}
                  title={t('checkout.mode.guest')}
                  note={HTTP ? t('checkout.mode.guestNoteApi') : t('checkout.mode.guestNoteDemo')}
                />
                <Choice
                  name="mode"
                  checked={mode === 'account'}
                  onChange={() => setMode('account')}
                  title={t('checkout.mode.account')}
                  note={HTTP ? t('checkout.mode.accountNoteApi') : t('checkout.mode.accountNoteDemo')}
                />
              </fieldset>
              {mode === 'guest' ? (
                <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
                  <Field id={`${uid}-name`} label={t('checkout.field.name')} error={errors.name} className="sm:col-span-2">
                    <input {...field('name')} autoComplete="name" />
                  </Field>
                  <Field id={`${uid}-email`} label={t('checkout.field.email')} error={errors.email}>
                    <input {...field('email')} type="email" inputMode="email" autoComplete="email" />
                  </Field>
                  <Field id={`${uid}-phone`} label={t('checkout.field.phone')} error={errors.phone}>
                    <input
                      {...field('phone')}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+62 812 3456 7890"
                    />
                  </Field>
                </div>
              ) : (
                <div className="space-y-4">
                  {HTTP && !account ? (
                    <>
                      <ButtonLink
                        to={`${paths.account(store)}?next=${encodeURIComponent(paths.checkout(store))}`}
                      >
                        {t('checkout.signIn')}
                      </ButtonLink>
                      {errors.lookup && (
                        <p role="alert" className="text-sm font-semibold text-danger">
                          {errors.lookup}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      {!HTTP && (
                        <Field id={`${uid}-lookup`} label={t('checkout.field.accountEmail')} error={errors.lookup}>
                          <div className="gap-2 flex">
                            <input
                              id={`${uid}-lookup`}
                              type="email"
                              inputMode="email"
                              autoComplete="email"
                              value={lookup}
                              onChange={(e) => setLookup(e.target.value)}
                              className={inputClass}
                              {...describedBy(`${uid}-lookup`, errors.lookup)}
                            />
                            <Button variant="dark" onClick={() => findAccount(lookup)}>
                              {t('checkout.find')}
                            </Button>
                          </div>
                        </Field>
                      )}
                      {account ? (
                        <p
                          role="status"
                          className="gap-3 p-4 text-sm flex items-center rounded-[var(--sf-tile-radius)] bg-[var(--sf-soft)]"
                        >
                          <Check
                            className="size-5 shrink-0 text-[color:var(--sf-primary-text)]"
                            aria-hidden="true"
                          />
                          <span>
                            {tx(
                              'checkout.checkingOutAs',
                              { name: <strong key="name">{account.name}</strong> },
                              { tier: t(TIER_KEY[account.tier]), points: account.points },
                            )}
                          </span>
                        </p>
                      ) : (
                        demo.length > 0 && (
                          <div>
                            <p className="mb-2 text-sm text-[color:var(--sf-muted)]">
                              {t('checkout.demoAccounts')}
                            </p>
                            <ul className="gap-2 flex flex-wrap">
                              {demo.map((c) => (
                                <li key={c.id}>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setLookup(c.email)
                                      findAccount(c.email)
                                    }}
                                  >
                                    {c.name} · {t(TIER_KEY[c.tier])}
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <div className="gap-4 grid grid-cols-1">
                <Field id={`${uid}-city`} label={t('checkout.field.city')} error={errors.city}>
                  <select
                    id={`${uid}-city`}
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value)
                      if (e.target.value !== 'Jakarta' && courierId === 'gojek') setCourierId(firstCourier.id)
                    }}
                    className={inputClass}
                    {...describedBy(`${uid}-city`, errors.city)}
                  >
                    <option value="">{t('checkout.chooseCity')}</option>
                    {CITIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                {courier.id !== 'pickup' && (
                  <Field
                    id={`${uid}-address`}
                    label={t('checkout.field.address')}
                    error={errors.address}
                    hint={t('checkout.field.addressHint')}
                  >
                    <textarea
                      id={`${uid}-address`}
                      rows={3}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      autoComplete="street-address"
                      className={cn(inputClass, 'py-3 h-auto')}
                      {...describedBy(`${uid}-address`, errors.address, 'hint')}
                    />
                  </Field>
                )}
              </div>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-semibold">{t('checkout.courierLegend')}</legend>
                {availableCouriers.map((c) => {
                  const fee = courierFee(c, totals.freeShipping)
                  const blocked = !!c.jakartaOnly && city !== 'Jakarta'
                  return (
                    <Choice
                      key={c.id}
                      name="courier"
                      checked={courierId === c.id}
                      disabled={blocked}
                      onChange={() => setCourierId(c.id)}
                      title={c.label}
                      note={
                        blocked
                          ? t('checkout.jakartaOnly')
                          : c.id === 'pickup' && pickup
                            ? t('checkout.pickupAt', { eta: c.eta, place: `${pickup.name}, ${pickup.city}` })
                            : c.eta
                      }
                      aside={
                        fee === 0 ? (
                          <>
                            {c.fee > 0 && (
                              <span className="mr-1 text-xs font-normal text-[color:var(--sf-muted)] line-through">
                                {fmtIdr(c.fee)}
                              </span>
                            )}
                            {t('checkout.free')}
                          </>
                        ) : (
                          fmtIdr(fee)
                        )
                      }
                    />
                  )
                })}
              </fieldset>
            </>
          )}

          {step === 2 && (
            <fieldset
              className="space-y-2"
              aria-describedby={errors.payment ? `${uid}-payment-error` : undefined}
            >
              <legend className="mb-2 text-sm font-semibold">{t('checkout.paymentLegend')}</legend>
              {payable.map((pt) => {
                const Icon = METHOD_ICON[pt.method]
                const offers = offersFor(pt.id)
                return (
                  <Choice
                    key={pt.id}
                    name="payment"
                    checked={paymentId === pt.id}
                    onChange={() => setPaymentId(pt.id)}
                    icon={<Icon aria-hidden="true" />}
                    title={pt.name}
                    note={offers.length ? offers.join(' · ') : pt.provider}
                  >
                    <p className="text-sm text-[color:var(--sf-muted)]">{pt.instructions}</p>
                    {paysOnline(pt.id) && <p className="mt-3 text-sm">{t('checkout.payOnMidtrans')}</p>}
                    {pt.method === 'qris' && !paysOnline(pt.id) && (
                      <div className="mt-4 gap-3 sm:flex-row sm:items-center flex flex-col items-center">
                        <div className="bg-white p-3 rounded-[var(--sf-tile-radius)] border border-[color:var(--sf-line)]">
                          <FakeQr seed={`${tenant.id}-${totals.subtotal}`} />
                        </div>
                        <div className="space-y-2 sm:text-left text-center">
                          <p className="text-sm">
                            {tx(
                              'checkout.qrisPay',
                              { amount: <strong key="amount">{fmtIdr(total)}</strong> },
                              { store: tenant.name },
                            )}
                          </p>
                          <p className="text-sm text-[color:var(--sf-muted)]">{t('payment.qrisAfter')}</p>
                        </div>
                      </div>
                    )}
                    {pt.method === 'va' && !paysOnline(pt.id) && (
                      <p className="mt-3 text-sm">
                        {tx('checkout.vaNumber', {
                          number: (
                            <strong key="number" className="tracking-wider font-mono">
                              8808 {vaDigits}
                            </strong>
                          ),
                        })}
                      </p>
                    )}
                  </Choice>
                )
              })}
              {errors.payment && (
                <p id={`${uid}-payment-error`} className="text-sm text-danger">
                  {errors.payment}
                </p>
              )}
            </fieldset>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <dl className="gap-4 text-sm sm:grid-cols-3 grid grid-cols-1">
                <div>
                  <dt className="text-[color:var(--sf-muted)]">{t('checkout.review.contact')}</dt>
                  <dd className="font-semibold">{mode === 'account' ? account?.name : contact.name}</dd>
                  <dd>{mode === 'account' ? account?.email : contact.email}</dd>
                </div>
                <div>
                  <dt className="text-[color:var(--sf-muted)]">{t('checkout.review.delivery')}</dt>
                  <dd className="font-semibold">{courier.label}</dd>
                  <dd>
                    {courier.id === 'pickup'
                      ? `${pickup?.name}, ${pickup?.city}`
                      : `${address.trim()}, ${city}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-[color:var(--sf-muted)]">{t('checkout.review.payment')}</dt>
                  <dd className="font-semibold">{payment?.name}</dd>
                  <dd>
                    {payment?.method === 'cod'
                      ? t('checkout.review.cod')
                      : paysOnline(payment?.id)
                        ? t('checkout.review.midtrans')
                        : HTTP
                          ? t('payment.qrisAfter')
                          : demoPaymentNote()}
                  </dd>
                </div>
              </dl>
              {referral && (
                <p className="text-sm">{t('checkout.referral', { name: referral.name })}</p>
              )}
              <TermsConsent checked={agreed} onChange={setAgreed} />
              <label className="gap-3 text-sm flex items-start">
                <input
                  type="checkbox"
                  checked={offers}
                  onChange={(e) => setOffers(e.target.checked)}
                  className="mt-0.5 size-5 shrink-0 accent-[var(--sf-primary)]"
                />
                <span>
                  {t('checkout.offers')}
                  <span className="text-xs block text-[color:var(--sf-muted)]">{t('checkout.offersNote')}</span>
                </span>
              </label>
              {placeError && (
                <p
                  role="alert"
                  className="p-4 text-sm font-semibold rounded-[var(--sf-tile-radius)] border border-danger text-danger"
                >
                  {placeError.text()}
                </p>
              )}
            </div>
          )}

          <div className="gap-2 pt-5 md:flex-row md:flex-wrap md:items-center md:justify-between flex flex-col-reverse items-stretch border-t border-[color:var(--sf-line)]">
            {step > 0 ? (
              <Button variant="ghost" className="px-0" onClick={() => setStep((s) => s - 1)}>
                {t('checkout.backTo', { step: stepName(step - 1).toLowerCase() })}
              </Button>
            ) : (
              <ButtonLink to={paths.cart(store)} variant="ghost" className="px-0">
                {t('checkout.backToCart')}
              </ButtonLink>
            )}
            {step < 3 ? (
              <Button type="submit" size="lg" className="md:w-auto w-full">
                {t('checkout.continueTo', { step: stepName(step + 1).toLowerCase() })}
              </Button>
            ) : (
              <Button size="lg" onClick={place} className="md:w-auto w-full">
                {t('checkout.placeOrder', { amount: fmtIdr(total) })}
              </Button>
            )}
          </div>
        </form>

        <aside
          aria-label={t('checkout.cart.orderSummary')}
          className="sf-card space-y-5 p-5 md:p-6 lg:sticky lg:top-[var(--sf-sticky-top)] self-start"
        >
          <h2 className="sf-display text-xl font-bold">{tp('checkout.items', totals.count)}</h2>
          <ul className="space-y-3">
            {totals.items.map((i) => (
              <li key={i.line.key} className="gap-3 flex">
                <ProductImage
                  product={i.product}
                  size="sm"
                  className="size-14 shrink-0 rounded-[var(--sf-tile-radius)]"
                />
                <div className="min-w-0 text-sm flex-1">
                  <p className="font-semibold truncate">{i.product.name}</p>
                  <p className="text-xs text-[color:var(--sf-muted)]">
                    {[
                      i.variant.name !== 'Standard' ? i.variant.name : null,
                      ...i.modifiers.map((m) => m.name),
                    ]
                      .filter(Boolean)
                      .join(' · ') || t('checkout.standard')}{' '}
                    · {t('checkout.qty', { qty: i.line.qty })}
                  </p>
                </div>
                <p className="text-sm font-semibold shrink-0">{fmtIdr(i.total)}</p>
              </li>
            ))}
          </ul>
          <RupiahOnlyArea>
            <SummaryRows
              subtotal={totals.subtotal}
              discounts={totals.discounts}
              shipping={shipping}
              total={total}
              tax={tax}
            />
          </RupiahOnlyArea>
          <PayInRupiahNote />
          {totals.codeError && cart.cart.voucher && (
            <p className="text-sm text-danger">
              {cart.cart.voucher}: {codeErrorText(totals.codeError)}
            </p>
          )}
          <p className="text-sm text-[color:var(--sf-muted)]">
            {t('checkout.earnPoints', { points: Math.floor(total / 10_000) * tenant.loyalty.pointsPer10k })}
          </p>
        </aside>
      </div>
    </div>
  )
}
