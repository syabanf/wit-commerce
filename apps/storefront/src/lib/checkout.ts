import { newId, nextCode, nowIso } from '@rc/fixtures'
import type { Courier, Customer, Order, OrderEvent, PaymentType, StockLevel } from '@rc/types'
import type { CartTotals } from './cart'
import type { Catalog } from './catalog'
import { AVATAR_PALETTE } from '@rc/ui'

export const CITIES = [
  'Jakarta',
  'Bekasi',
  'Tangerang',
  'Depok',
  'Bogor',
  'Bandung',
  'Semarang',
  'Yogyakarta',
  'Surabaya',
  'Malang',
  'Denpasar',
  'Medan',
  'Makassar',
] as const

export interface CourierOption {
  id: Courier
  label: string
  eta: string
  fee: number
  /** Same-day couriers only reach Jakarta addresses. */
  jakartaOnly?: boolean
}

export const COURIERS: CourierOption[] = [
  { id: 'jne', label: 'JNE Regular', eta: '2 to 3 days', fee: 18_000 },
  { id: 'sicepat', label: 'SiCepat', eta: '2 to 4 days', fee: 15_000 },
  { id: 'gojek', label: 'GoSend Same Day', eta: 'Arrives today', fee: 32_000, jakartaOnly: true },
  { id: 'pickup', label: 'Store pickup', eta: 'Ready in 2 hours', fee: 0 },
]

/** Cheapest paid courier, for the cart's shipping estimate. */
export const CHEAPEST_FEE = Math.min(...COURIERS.filter((c) => c.fee > 0).map((c) => c.fee))

export function courierFee(courier: CourierOption, freeShipping: boolean) {
  return freeShipping ? 0 : courier.fee
}

/** Ship from the warehouse in the delivery city, else the first one that holds every line, else the first. */
export function pickWarehouse(
  catalog: Catalog,
  city: string,
  lines: Order['lines'],
  stock: readonly StockLevel[],
): string {
  const { warehouses } = catalog
  const local = warehouses.find((w) => w.city === city)
  if (local) return local.id
  const holdsAll = warehouses.find((w) =>
    lines.every((l) => {
      const level = stock.find((s) => s.variantId === l.variantId && s.warehouseId === w.id)
      return !level || level.onHand - level.reserved >= l.qty
    }),
  )
  return (holdsAll ?? warehouses[0])?.id ?? ''
}

export interface Contact {
  name: string
  email: string
  phone: string
}

export interface PlaceInput {
  catalog: Catalog
  totals: CartTotals
  stock: readonly StockLevel[]
  /** Existing order and customer codes, for the next sequential code. */
  orderCodes: readonly string[]
  customerCodes: readonly string[]
  customer: Customer | null
  contact: Contact
  sellerId: string | null
  city: string
  courier: CourierOption
  payment: PaymentType
}

/** Builds the order, and for a guest the customer record, exactly as `orders/place` expects them. */
export function buildOrder(input: PlaceInput): { order: Order; customer: Customer | null } {
  const { catalog, totals, sellerId, courier, payment } = input
  const { tenant } = catalog
  const at = nowIso()
  const channel = sellerId ? 'personal_store' : 'web'
  const newCustomer: Customer | null = input.customer
    ? null
    : {
        id: newId('cus'),
        tenantId: tenant.id,
        code: nextCode(input.customerCodes, `${tenant.code}-C`, 5),
        name: input.contact.name.trim(),
        email: input.contact.email.trim().toLowerCase(),
        phone: input.contact.phone.trim(),
        city: input.city,
        source: channel,
        stage: 'first_buyer',
        tier: 'member',
        points: 0,
        tags: [],
        interests: [...new Set(totals.items.map((l) => l.product.categoryId))],
        sellerId,
        createdAt: at,
        birthday: null,
        color: AVATAR_PALETTE[input.customerCodes.length % AVATAR_PALETTE.length]!,
      }
  const customerId = input.customer?.id ?? newCustomer!.id
  const lines: Order['lines'] = totals.items.map((l) => ({
    productId: l.product.id,
    variantId: l.variant.id,
    qty: l.line.qty,
    price: l.unit,
    ...(l.modifiers.length
      ? {
          modifiers: l.modifiers.map((m) => ({
            groupId: m.groupId,
            optionId: m.optionId,
            name: m.name,
            priceDelta: m.priceDelta,
          })),
        }
      : {}),
  }))
  const shipping = courierFee(courier, totals.freeShipping)
  const total = Math.max(0, totals.subtotal - totals.discount + shipping)
  const cod = payment.method === 'cod'
  const placed: OrderEvent = {
    id: newId('oev'),
    at,
    by: 'storefront',
    status: 'new',
    note: 'Order placed on the storefront',
  }
  const paid: OrderEvent = {
    id: newId('oev'),
    at,
    by: 'storefront',
    status: 'paid',
    note: `Paid with ${payment.name}`,
  }
  const order: Order = {
    id: newId('ord'),
    tenantId: tenant.id,
    code: nextCode(input.orderCodes, `${tenant.code}-`, 5),
    customerId,
    channel,
    sellerId,
    campaignId: null,
    status: cod ? 'confirmed' : 'paid',
    paymentStatus: cod ? 'pending' : 'paid',
    paymentMethod: payment.method,
    paymentTypeId: payment.id,
    courier: courier.id,
    trackingNo: null,
    warehouseId: pickWarehouse(catalog, input.city, lines, input.stock),
    city: input.city,
    lines,
    subtotal: totals.subtotal,
    discount: totals.discount,
    shipping,
    total,
    voucherCode: totals.appliedCode,
    discountLines: totals.discounts,
    pointsEarned: Math.floor(total / 10_000) * tenant.loyalty.pointsPer10k,
    createdAt: at,
    cancelReason: null,
    refundedAmount: 0,
    // Newest first, as the order timeline reads.
    events: cod ? [placed] : [paid, placed],
  }
  return { order, customer: newCustomer }
}

/** The first interest of a signed-in customer leads their recommendations. */
export const favouriteOf = (customer: Customer | null) => customer?.interests[0] ?? null

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const PHONE_PATTERN = /^\+?[\d\s-]{9,16}$/
