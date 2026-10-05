import {
  availablePaymentTypes,
  describePromotion,
  fmtIdr,
  nowMs,
  orderPlaceBlocker,
  plural,
} from '@rc/fixtures'
import type { Courier, PaymentMethod, PaymentType } from '@rc/types'
import { LOYALTY_TIER_LABEL } from '@rc/types'
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
import { type FormEvent, type ReactNode, useId, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { SummaryRows } from '../components/cartParts'
import { ProductImage } from '../components/product'
import { Button, ButtonLink, EmptyState, Field, describedBy, inputClass } from '../components/ui'
import { cartTotals } from '../lib/cart'
import { CITIES, COURIERS, EMAIL_PATTERN, PHONE_PATTERN, buildOrder, courierFee } from '../lib/checkout'
import { paths } from '../lib/paths'
import { useTitle } from '../lib/useTitle'
import { useShop } from '../state/shop'
import { useStore } from '../state/store'

const STEPS = ['Contact', 'Delivery', 'Payment', 'Review'] as const

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
        Step {step + 1} of {STEPS.length} · {STEPS[step]}
      </p>
      <div aria-hidden="true" className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--sf-line)]">
        <div
          className="h-full rounded-full bg-[var(--sf-text)] transition-[width]"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  )
}

function Stepper({ step, onBack }: { step: number; onBack: (i: number) => void }) {
  return (
    <ol className="min-w-0 gap-2 md:flex no-scrollbar hidden overflow-x-auto" aria-label="Checkout steps">
      {STEPS.map((label, i) => {
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
              {done && <span className="sr-only">, done</span>}
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
      aria-label="QRIS code to scan"
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
  const { catalog, cart, customer, customers, referral, store, tenant, send, signIn } = shop
  const navigate = useNavigate()
  const uid = useId()
  useTitle(`Checkout · ${tenant.name}`)

  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<'guest' | 'account'>(customer ? 'account' : 'guest')
  const [contact, setContact] = useState({ name: '', email: '', phone: '' })
  const [lookup, setLookup] = useState(customer?.email ?? '')
  const [accountId, setAccountId] = useState<string | null>(customer?.id ?? null)
  const account = customers.find((c) => c.id === accountId) ?? null
  const [city, setCity] = useState<string>(
    customer && (CITIES as readonly string[]).includes(customer.city) ? customer.city : '',
  )
  const [address, setAddress] = useState('')
  const [courierId, setCourierId] = useState<Courier>('jne')
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [qrisPaid, setQrisPaid] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [placeError, setPlaceError] = useState<string | null>(null)

  const totals = useMemo(
    () => cartTotals(catalog, cart.cart, referral?.id ?? null, nowMs(), paymentId),
    [catalog, cart.cart, referral, paymentId],
  )
  const courier = COURIERS.find((c) => c.id === courierId) ?? COURIERS[0]!
  const shipping = courierFee(courier, totals.freeShipping)
  const total = Math.max(0, totals.subtotal - totals.discount + shipping)
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
        <h1 className="sf-display text-3xl font-bold">Checkout</h1>
        <EmptyState
          icon={<ShoppingBag aria-hidden="true" />}
          title="Your cart is empty"
          text="Add a product before you check out."
          action={<ButtonLink to={paths.home(store)}>Start shopping</ButtonLink>}
        />
      </div>
    )

  const findAccount = (email: string) => {
    const match = customers.find((c) => c.email.toLowerCase() === email.trim().toLowerCase())
    setAccountId(match?.id ?? null)
    setErrors((e) => ({
      ...e,
      lookup: match
        ? undefined
        : 'We could not find an account with that email. Check the spelling, or check out as a guest.',
    }))
    if (match && (CITIES as readonly string[]).includes(match.city) && !city) setCity(match.city)
  }

  const validate = (s: number): Errors => {
    const e: Errors = {}
    if (s === 0) {
      if (mode === 'account') {
        if (!account) e.lookup = 'Find your account by email first, or check out as a guest.'
      } else {
        if (!contact.name.trim()) e.name = 'Enter your full name for the delivery label.'
        if (!EMAIL_PATTERN.test(contact.email.trim()))
          e.email = 'Enter an email address such as name@example.com, so we can send your receipt.'
        if (!PHONE_PATTERN.test(contact.phone.trim()))
          e.phone = 'Enter a phone number with 9 to 16 digits, so the courier can call you.'
      }
    }
    if (s === 1) {
      if (!city) e.city = 'Choose the city we deliver to.'
      if (courier.id !== 'pickup' && address.trim().length < 8)
        e.address = 'Enter the street, number and area so the courier can find you.'
    }
    if (s === 2) {
      if (!payment) e.payment = 'Choose how you want to pay.'
      else if (payment.method === 'qris' && !qrisPaid)
        e.payment = 'Scan the QR code, then choose I have paid to continue.'
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
      orderCodes: state.orders.map((o) => o.code),
      customerCodes: state.customers.map((c) => c.code),
      customer: existing,
      contact: contactInfo,
      sellerId: referral?.id ?? null,
      city,
      courier,
      payment,
    })
    const blocker = orderPlaceBlocker(order, state.stock)
    if (blocker) {
      setPlaceError(blocker)
      return
    }
    send({ type: 'orders/place', order, customer: created })
    signIn(order.customerId)
    cart.clear()
    navigate(paths.order(store, order.id), { replace: true })
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
        <h1 className="sf-display text-3xl font-bold">Checkout</h1>
        <StepProgress step={step} />
        <Stepper step={step} onBack={setStep} />
      </div>
      <div className="gap-6 lg:grid-cols-[minmax(0,1fr)_380px] grid grid-cols-1">
        <form onSubmit={next} noValidate className="sf-card min-w-0 space-y-6 p-5 md:p-8">
          <h2 className="sf-display text-2xl font-bold">
            {step + 1}. {STEPS[step]}
          </h2>

          {step === 0 && (
            <>
              <fieldset className="gap-2 sm:grid-cols-2 grid grid-cols-1">
                <legend className="sr-only">How do you want to check out?</legend>
                <Choice
                  name="mode"
                  checked={mode === 'guest'}
                  onChange={() => setMode('guest')}
                  title="Check out as a guest"
                  note="We create your member account with this order."
                />
                <Choice
                  name="mode"
                  checked={mode === 'account'}
                  onChange={() => setMode('account')}
                  title="I have an account"
                  note="Find it by the email you shop with."
                />
              </fieldset>
              {mode === 'guest' ? (
                <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
                  <Field id={`${uid}-name`} label="Full name" error={errors.name} className="sm:col-span-2">
                    <input {...field('name')} autoComplete="name" />
                  </Field>
                  <Field id={`${uid}-email`} label="Email" error={errors.email}>
                    <input {...field('email')} type="email" inputMode="email" autoComplete="email" />
                  </Field>
                  <Field id={`${uid}-phone`} label="Phone" error={errors.phone}>
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
                  <Field id={`${uid}-lookup`} label="Account email" error={errors.lookup}>
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
                        Find
                      </Button>
                    </div>
                  </Field>
                  {account ? (
                    <p
                      role="status"
                      className="gap-3 p-4 text-sm flex items-center rounded-[var(--sf-tile-radius)] bg-[var(--sf-soft)]"
                    >
                      <Check className="size-5 shrink-0 text-[color:var(--sf-primary)]" aria-hidden="true" />
                      <span>
                        Checking out as <strong>{account.name}</strong>, {LOYALTY_TIER_LABEL[account.tier]}{' '}
                        member with {account.points} points.
                      </span>
                    </p>
                  ) : (
                    demo.length > 0 && (
                      <div>
                        <p className="mb-2 text-sm text-[color:var(--sf-muted)]">
                          Demo accounts for this store:
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
                                {c.name} · {LOYALTY_TIER_LABEL[c.tier]}
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  )}
                </div>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <div className="gap-4 grid grid-cols-1">
                <Field id={`${uid}-city`} label="City" error={errors.city}>
                  <select
                    id={`${uid}-city`}
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value)
                      if (e.target.value !== 'Jakarta' && courierId === 'gojek') setCourierId('jne')
                    }}
                    className={inputClass}
                    {...describedBy(`${uid}-city`, errors.city)}
                  >
                    <option value="">Choose a city</option>
                    {CITIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                {courier.id !== 'pickup' && (
                  <Field
                    id={`${uid}-address`}
                    label="Street address"
                    error={errors.address}
                    hint="Street, number, RT/RW, district and postcode."
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
                <legend className="mb-2 text-sm font-semibold">Courier</legend>
                {COURIERS.map((c) => {
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
                          ? 'Same-day delivery reaches Jakarta addresses only.'
                          : c.id === 'pickup' && pickup
                            ? `${c.eta} at ${pickup.name}, ${pickup.city}`
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
                            Free
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
              <legend className="mb-2 text-sm font-semibold">Payment method</legend>
              {payable.map((t) => {
                const Icon = METHOD_ICON[t.method]
                const offers = offersFor(t.id)
                return (
                  <Choice
                    key={t.id}
                    name="payment"
                    checked={paymentId === t.id}
                    onChange={() => {
                      setPaymentId(t.id)
                      setQrisPaid(false)
                    }}
                    icon={<Icon aria-hidden="true" />}
                    title={t.name}
                    note={offers.length ? offers.join(' · ') : t.provider}
                  >
                    <p className="text-sm text-[color:var(--sf-muted)]">{t.instructions}</p>
                    {t.method === 'qris' && (
                      <div className="mt-4 gap-3 sm:flex-row sm:items-center flex flex-col items-center">
                        <div className="bg-white p-3 rounded-[var(--sf-tile-radius)] border border-[color:var(--sf-line)]">
                          <FakeQr seed={`${tenant.id}-${totals.subtotal}`} />
                        </div>
                        <div className="space-y-2 sm:text-left text-center">
                          <p className="text-sm">
                            Pay <strong>{fmtIdr(total)}</strong> to {tenant.name}. This is a simulation, no
                            money moves.
                          </p>
                          {qrisPaid ? (
                            <p
                              role="status"
                              className="gap-2 text-sm font-semibold flex items-center text-[color:var(--sf-primary)]"
                            >
                              <Check className="size-4" aria-hidden="true" /> Payment received
                            </p>
                          ) : (
                            <Button variant="dark" onClick={() => setQrisPaid(true)}>
                              I have paid
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                    {t.method === 'va' && (
                      <p className="mt-3 text-sm">
                        Account number <strong className="tracking-wider font-mono">8808 {vaDigits}</strong>,
                        shown again on your receipt.
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
                  <dt className="text-[color:var(--sf-muted)]">Contact</dt>
                  <dd className="font-semibold">{mode === 'account' ? account?.name : contact.name}</dd>
                  <dd>{mode === 'account' ? account?.email : contact.email}</dd>
                </div>
                <div>
                  <dt className="text-[color:var(--sf-muted)]">Delivery</dt>
                  <dd className="font-semibold">{courier.label}</dd>
                  <dd>
                    {courier.id === 'pickup'
                      ? `${pickup?.name}, ${pickup?.city}`
                      : `${address.trim()}, ${city}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-[color:var(--sf-muted)]">Payment</dt>
                  <dd className="font-semibold">{payment?.name}</dd>
                  <dd>
                    {payment?.method === 'cod'
                      ? 'Pay the courier on arrival'
                      : 'Paid when you place the order'}
                  </dd>
                </div>
              </dl>
              {referral && (
                <p className="text-sm">This order credits {referral.name}, who brought you here.</p>
              )}
              {placeError && (
                <p
                  role="alert"
                  className="p-4 text-sm font-semibold rounded-[var(--sf-tile-radius)] border border-danger text-danger"
                >
                  {placeError}
                </p>
              )}
            </div>
          )}

          <div className="gap-2 pt-5 md:flex-row md:flex-wrap md:items-center md:justify-between flex flex-col-reverse items-stretch border-t border-[color:var(--sf-line)]">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
                Back to {STEPS[step - 1]!.toLowerCase()}
              </Button>
            ) : (
              <ButtonLink to={paths.cart(store)} variant="ghost">
                Back to cart
              </ButtonLink>
            )}
            {step < 3 ? (
              <Button type="submit" size="lg" className="md:w-auto w-full">
                Continue to {STEPS[step + 1]!.toLowerCase()}
              </Button>
            ) : (
              <Button size="lg" onClick={place} className="md:w-auto w-full">
                Place order · {fmtIdr(total)}
              </Button>
            )}
          </div>
        </form>

        <aside
          aria-label="Order summary"
          className="sf-card space-y-5 p-5 md:p-6 lg:sticky lg:top-[var(--sf-sticky-top)] self-start"
        >
          <h2 className="sf-display text-xl font-bold">{plural(totals.count, 'item')}</h2>
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
                      .join(' · ') || 'Standard'}{' '}
                    · Qty {i.line.qty}
                  </p>
                </div>
                <p className="text-sm font-semibold shrink-0">{fmtIdr(i.total)}</p>
              </li>
            ))}
          </ul>
          <SummaryRows
            subtotal={totals.subtotal}
            discounts={totals.discounts}
            shipping={shipping}
            total={total}
          />
          {totals.codeError && cart.cart.voucher && (
            <p className="text-sm text-danger">
              {cart.cart.voucher}: {totals.codeError}
            </p>
          )}
          <p className="text-sm text-[color:var(--sf-muted)]">
            You earn {Math.floor(total / 10_000) * tenant.loyalty.pointsPer10k} points with this order.
          </p>
        </aside>
      </div>
    </div>
  )
}
