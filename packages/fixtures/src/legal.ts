import type { Courier, EtaDays, IsoDate, SellerLegal, Tenant, TicketContact } from '@rc/types'
import { BUSINESS_TYPES, DISPUTE_FORUMS } from '@rc/types'
import { DAY, toIso, toMs, wib } from './dates'
import { returnWindowDays } from './rules'

// Seller identity, complaint service, terms and delivery estimates (PP 80/2019 Pasal 9, 13, 27, 39,
// 53 and 66). apps/api/internal/rules/legal.go mirrors every function here.

/** Working days a brand takes to resolve a complaint when it set none. */
export const DEFAULT_COMPLAINT_DAYS = 3

/** The complaint procedure shoppers read when the brand wrote none. */
export const DEFAULT_COMPLAINT_PROCEDURE = [
  'Send your complaint with the form on this page, or contact us by phone, WhatsApp or email.',
  'Include your order number, what went wrong, and photos if the item arrived damaged or wrong.',
  'We confirm we received it within one working day and tell you who is handling it.',
  'We follow up by email or phone until it is resolved, and tell you the outcome in writing.',
].join('\n')

/** The terms template revision. Raise it whenever the generated wording changes. */
export const TERMS_REVISION = 1

export const complaintDays = (tenant: Pick<Tenant, 'legal'> | undefined) =>
  tenant?.legal?.complaintDays ?? DEFAULT_COMPLAINT_DAYS

const chars = (s: string) => [...s].length
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^[0-9+() -]+$/
const digits = (s: string) => s.replace(/\D/g, '').length

/** Null for a reachable phone number written with digits, spaces, +, - and brackets. */
const phoneProblem = (phone: string) =>
  PHONE.test(phone) && digits(phone) >= 8 && digits(phone) <= 15
    ? null
    : 'Enter a phone number of 8 to 15 digits.'

const LIMITS: [keyof SellerLegal, number, string][] = [
  ['entityName', 120, 'legal name'],
  ['address', 300, 'address'],
  ['city', 60, 'city'],
  ['hours', 120, 'service hours'],
  ['complaintProcedure', 2000, 'complaint procedure'],
  ['disputeVenue', 120, 'dispute venue'],
  ['termsExtra', 4000, 'extra terms'],
]

const LEGAL_KEYS: (keyof SellerLegal)[] = [
  'entityName',
  'businessType',
  'nib',
  'npwp',
  'address',
  'city',
  'phone',
  'email',
  'hours',
  'complaintProcedure',
  'complaintDays',
  'disputeForum',
  'disputeVenue',
  'termsExtra',
]

/** Trims every text field and drops the empty ones and any unknown key, so a cleared field leaves the record. */
export function normalizeLegal(legal: SellerLegal): SellerLegal {
  const out: Record<string, unknown> = {}
  for (const key of LEGAL_KEYS) {
    const value = legal[key]
    if (typeof value === 'string') {
      if (value.trim()) out[key] = value.trim()
    } else if (value !== undefined && value !== null) out[key] = value
  }
  return out as SellerLegal
}

/** Why the seller's legal details cannot be saved, or null. Checks the normalized record. */
export function legalBlocker(legal: SellerLegal): string | null {
  for (const [key, max, label] of LIMITS) {
    const value = legal[key]
    if (typeof value === 'string' && chars(value) > max) return `Keep the ${label} within ${max} characters.`
  }
  if (legal.businessType !== undefined && !BUSINESS_TYPES.includes(legal.businessType))
    return 'Pick perorangan, CV or PT as the business type.'
  if (legal.nib !== undefined && !/^\d{13}$/.test(legal.nib)) return 'The NIB has 13 digits.'
  if (legal.npwp !== undefined && !(/^[0-9.-]+$/.test(legal.npwp) && [15, 16].includes(digits(legal.npwp))))
    return 'The NPWP has 15 or 16 digits.'
  if (legal.phone !== undefined) {
    const why = phoneProblem(legal.phone)
    if (why) return why
  }
  if (legal.email !== undefined && !(EMAIL.test(legal.email) && chars(legal.email) <= 120))
    return 'Enter a customer service email such as help@yourbrand.id.'
  if (
    legal.complaintDays !== undefined &&
    !(Number.isInteger(legal.complaintDays) && legal.complaintDays >= 1 && legal.complaintDays <= 30)
  )
    return 'Set the complaint resolution time between 1 and 30 working days.'
  if (legal.disputeForum !== undefined && !DISPUTE_FORUMS.includes(legal.disputeForum))
    return 'Pick a court, BPSK or arbitration for disputes.'
  return null
}

/** The identity details a store still lacks before shoppers can see who they buy from. */
export function legalMissing(tenant: Pick<Tenant, 'legal'>): string[] {
  const l = tenant.legal ?? {}
  const missing: string[] = []
  if (!l.entityName) missing.push('Legal name')
  if (!l.businessType) missing.push('Business type')
  if (!l.nib) missing.push('NIB')
  if (!l.address) missing.push('Registered address')
  if (!l.phone) missing.push('Customer service phone')
  if (!l.email) missing.push('Customer service email')
  if (!l.hours) missing.push('Service hours')
  return missing
}

// --- delivery estimates ---

/** Days a parcel takes after it ships, per courier, when the brand set none. */
export const DEFAULT_COURIER_ETA: Record<Courier, EtaDays> = {
  jne: { min: 2, max: 3 },
  jnt: { min: 2, max: 4 },
  sicepat: { min: 2, max: 4 },
  grab: { min: 0, max: 0 },
  gojek: { min: 0, max: 0 },
  lalamove: { min: 0, max: 1 },
  pickup: { min: 0, max: 0 },
}

export const COURIERS_WITH_ETA = Object.keys(DEFAULT_COURIER_ETA) as Courier[]

export const courierEta = (tenant: Pick<Tenant, 'courierEtaDays'> | undefined, courier: Courier): EtaDays =>
  tenant?.courierEtaDays?.[courier] ?? DEFAULT_COURIER_ETA[courier]

/** "Same day", "1 day" or "2 to 3 days". */
export function etaLabel(eta: EtaDays): string {
  if (eta.max === 0) return 'Same day'
  if (eta.min === eta.max) return eta.min === 1 ? '1 day' : `${eta.min} days`
  return `${eta.min} to ${eta.max} days`
}

/** Why the delivery estimates cannot be saved, or null. */
export function courierEtaBlocker(etas: Partial<Record<Courier, EtaDays>>): string | null {
  for (const [courier, eta] of Object.entries(etas)) {
    if (!COURIERS_WITH_ETA.includes(courier as Courier)) return `${courier} is not a courier stores offer.`
    if (
      !eta ||
      !Number.isInteger(eta.min) ||
      !Number.isInteger(eta.max) ||
      eta.min < 0 ||
      eta.max < eta.min ||
      eta.max > 30
    )
      return 'Delivery days run from 0 to 30, and the earliest day comes first.'
  }
  return null
}

/** The calendar window a parcel should arrive in, from when it shipped. */
export const arrivalWindow = (shippedAt: IsoDate, eta: EtaDays) => ({
  from: toMs(shippedAt) + eta.min * DAY,
  to: toMs(shippedAt) + eta.max * DAY,
})

// --- complaints ---

/** The instant n working days (Monday to Friday, WIB) after at. Public holidays still count. */
export function addWorkingDays(at: IsoDate, n: number): IsoDate {
  let ms = toMs(at)
  let left = n
  while (left > 0) {
    ms += DAY
    const { weekday } = wib(ms)
    if (weekday !== 0 && weekday !== 6) left--
  }
  return toIso(ms)
}

/** What a shopper sends with the complaint form. */
export interface ComplaintInput {
  id: string
  tenantId: string
  /** The signed-in shopper; null for a guest. */
  customerId: string | null
  /** One of the shopper's own orders, or null. */
  orderId: string | null
  subject: string
  message: string
  contact: TicketContact
}

/** Why a complaint cannot be sent, or null. Checks trimmed values. */
export function complaintBlocker(c: Pick<ComplaintInput, 'subject' | 'message' | 'contact'>): string | null {
  const subject = c.subject.trim()
  const message = c.message.trim()
  const { name, email, phone } = trimContact(c.contact)
  if (chars(subject) < 3 || chars(subject) > 120)
    return 'Give your complaint a subject of 3 to 120 characters.'
  if (chars(message) < 10 || chars(message) > 2000) return 'Describe the problem in 10 to 2000 characters.'
  if (!name || chars(name) > 80) return 'Enter your name, up to 80 characters.'
  if (!email && !phone) return 'Leave an email or a phone number so we can reply.'
  if (email && !(EMAIL.test(email) && chars(email) <= 120)) return 'Enter an email such as you@example.com.'
  if (phone) return phoneProblem(phone)
  return null
}

export const trimContact = (c: TicketContact): TicketContact => ({
  name: c.name.trim(),
  email: c.email.trim(),
  phone: c.phone.trim(),
})

// --- terms version ---

/** FNV-1a, 32 bits, over the UTF-8 bytes. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * The version of the terms a store shows now: the template revision and a hash of the brand's values
 * the terms page prints. Any change to the legal details, return window or delivery days gives a new
 * version. The payment methods it lists come from checkout and are not part of the version.
 */
export function termsVersion(
  tenant: Pick<Tenant, 'name' | 'legal' | 'returnWindowDays' | 'courierEtaDays'>,
): string {
  const l = tenant.legal ?? {}
  const parts = [
    String(TERMS_REVISION),
    tenant.name,
    l.entityName ?? '',
    l.businessType ?? '',
    l.nib ?? '',
    l.npwp ?? '',
    l.address ?? '',
    l.city ?? '',
    l.phone ?? '',
    l.email ?? '',
    l.hours ?? '',
    l.complaintProcedure ?? '',
    String(complaintDays(tenant)),
    l.disputeForum ?? 'court',
    l.disputeVenue ?? '',
    l.termsExtra ?? '',
    String(returnWindowDays(tenant)),
    COURIERS_WITH_ETA.flatMap((c) => {
      const eta = tenant.courierEtaDays?.[c]
      return eta ? [`${c}:${eta.min}-${eta.max}`] : []
    }).join(','),
  ]
  return `${TERMS_REVISION}.${fnv1a(parts.join('\u001f'))}`
}
