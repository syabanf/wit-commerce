import type {
  ConsentSource,
  Customer,
  CustomerEventKind,
  IsoDate,
  Lead,
  Order,
  OrderReturn,
  Ticket,
} from '@rc/types'
import { OPEN_RETURN_STATUSES } from '@rc/types'

// Personal data erasure (UU PDP Pasal 8 and 43 to 45, PP 80/2019 Pasal 59) and marketing consent
// (UU PDP Pasal 20 to 24). apps/api/internal/rules/privacy.go mirrors this file.

/** Replace a customer's name and their free text after erasure. */
export const ERASED_NAME = 'Erased customer'
export const ERASED_TEXT = 'Erased'

/** History rows whose label holds what the shopper or staff typed. */
export const ERASED_EVENT_KINDS: ReadonlySet<CustomerEventKind> = new Set([
  'note',
  'review',
  'support',
  'search',
])

const CONSENT_SOURCES: ReadonlySet<ConsentSource> = new Set([
  'checkout',
  'account',
  'staff',
  'unsubscribe',
  'request',
])

/** Order statuses that still need the shopper's contact details. */
const BEFORE_DELIVERY = new Set(['new', 'confirmed', 'paid', 'processing', 'packed', 'shipped'])

/**
 * Refuses erasure while the courier or a refund still needs the shopper's contact details, and for
 * a customer already erased.
 */
export function customerEraseBlocker(
  customer: Customer,
  orders: Pick<Order, 'code' | 'status'>[],
  returns: Pick<OrderReturn, 'code' | 'status'>[],
): string | null {
  if (customer.erasedAt) return "This customer's personal data is already erased."
  const waiting = orders.filter((o) => BEFORE_DELIVERY.has(o.status)).map((o) => o.code)
  if (waiting.length)
    return `Deliver or cancel ${waiting.join(', ')} first. The courier still needs the contact details.`
  const open = returns.find((r) => OPEN_RETURN_STATUSES.includes(r.status))
  if (open) return `Close return ${open.code} first. The refund still needs the contact details.`
  return null
}

/** The customer with placeholders for their personal data. Code, points, tier and dates stay. */
export function eraseCustomer(customer: Customer, at: IsoDate): Customer {
  const { marketingConsent: _consent, ...rest } = customer
  return {
    ...rest,
    name: ERASED_NAME,
    email: '',
    phone: '',
    city: '',
    birthday: null,
    tags: [],
    interests: [],
    erasedAt: at,
  }
}

export const eraseLead = (lead: Lead): Lead => ({
  ...lead,
  name: ERASED_NAME,
  company: '',
  phone: '',
  note: '',
})

export const eraseTicket = (ticket: Ticket): Ticket => ({ ...ticket, subject: ERASED_TEXT })

/** Whether a marketing message may go to the customer: only with consent they have not withdrawn. */
export const marketingAllowed = (customer: Customer) =>
  !customer.erasedAt && customer.marketingConsent?.granted === true

/** Refuses a consent change that changes nothing or comes from an unknown place. */
export function consentBlocker(
  customer: Customer,
  granted: boolean,
  source: ConsentSource,
  textVersion: string,
): string | null {
  if (customer.erasedAt) return "This customer's personal data is erased."
  if (!CONSENT_SOURCES.has(source)) return 'Unknown consent source.'
  if (granted && !textVersion.trim()) return 'Name the wording the shopper agreed to.'
  if (marketingAllowed(customer) === granted)
    return granted
      ? 'This customer already agreed to marketing messages.'
      : 'This customer already receives no marketing messages.'
  return null
}

/** The history line for a consent change. */
export const consentLabel = (granted: boolean, source: ConsentSource) =>
  granted ? `Agreed to marketing messages · ${source}` : `Withdrew marketing consent · ${source}`

/** Splits a segment's customers into who a marketing message reaches and how many it skips. */
export function marketingReach(customers: Customer[]): { reach: Customer[]; skipped: number } {
  const reach = customers.filter(marketingAllowed)
  return { reach, skipped: customers.length - reach.length }
}
