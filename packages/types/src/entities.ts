import type {
  AgentKind,
  AutomationStatus,
  AutomationStepKind,
  AttributeType,
  AutomationTrigger,
  BrandLockKey,
  BrandPersonality,
  BusinessType,
  ButtonStyle,
  CampaignStatus,
  CollectionMode,
  CancelReason,
  Channel,
  Courier,
  CustomerEventKind,
  DisputeForum,
  FunnelStep,
  Industry,
  IntegrationCategory,
  IntegrationHealth,
  IsoDate,
  LeadSource,
  LeadStage,
  LifecycleStage,
  LoyaltyTier,
  MessageChannel,
  ModifierSelection,
  OrderStatus,
  PageKind,
  PageStatus,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
  ProductType,
  PromotionKind,
  PromotionStatus,
  PromotionTrigger,
  RadiusScale,
  ReturnReason,
  ReturnRefundMethod,
  ReturnShippingPayer,
  ReturnStatus,
  Role,
  SectionKind,
  SectionRule,
  ShopperEmailKind,
  StoreLanguage,
  SegmentField,
  SegmentOp,
  SellerKind,
  SellerStatus,
  StockMoveKind,
  StorefrontTheme,
  TemplateScope,
  TicketKind,
  TicketStatus,
  ToneOfVoice,
  WebhookEvent,
} from './enums'
import type { ConsentSource, PrivacyRequestKind } from './enums'
import type { CancelRefundStatus, PaymentConfirmationStatus } from './enums'

// --- platform and tenants ---

/** Brand guideline of a tenant. Templates read these tokens, never hard-coded colours. */
export interface BrandConfig {
  colors: { primary: string; secondary: string; accent: string; background: string; text: string }
  fonts: { heading: string; body: string }
  theme: StorefrontTheme
  radius: RadiusScale
  buttonStyle: ButtonStyle
  personality: BrandPersonality
  tone: ToneOfVoice
  tagline: string
  /** True means locked: sellers and campaign pages use the tenant value. */
  locks: Record<BrandLockKey, boolean>
  /** An uploaded logo; empty means the storefront draws its own mark. */
  logoUrl?: string
}

export interface LoyaltyConfig {
  /** Points earned per Rp 10.000 spent. */
  pointsPer10k: number
  /** Lifetime spend needed for each tier. */
  thresholds: { silver: number; gold: number; platinum: number }
  /** Free shipping at or above this subtotal. */
  freeShippingMin: number
}

export interface Tenant {
  id: string
  code: string
  name: string
  industry: Industry
  plan: 'starter' | 'growth' | 'enterprise'
  subdomain: string
  domain: string | null
  domainVerified: boolean
  createdAt: IsoDate
  brand: BrandConfig
  loyalty: LoyaltyConfig
  /** Couriers available to shoppers. Older tenants without this field offer every courier. */
  shippingCouriers?: Courier[]
  /** Onboarding steps the tenant has finished, in order. */
  onboarding: string[]
  /** "signup" for a store its owner created from the public sign-up page. */
  source?: 'signup'
  /** ISO 4217 codes shoppers may see estimated prices in besides rupiah. Orders stay in rupiah. */
  displayCurrencies?: string[]
  /** The value the brand puts in a TXT record at _wit-commerce.{domain} to prove the domain is theirs. */
  domainToken?: string
  /** When DNS proved the custom domain. Only a domain with this time is served and linked to. */
  domainVerifiedAt?: IsoDate
  /** When the API last re-checked a verified domain's DNS. */
  domainCheckedAt?: IsoDate
  /** Daily re-checks that failed in a row. At 3 the domain stops being served. */
  domainCheckFailures?: number
  /** The store's own header and footer links. Without it the theme shows its fixed links. */
  menus?: StoreMenus
  /**
   * Days after delivery a shopper may ask for a return; 7 when unset. 0 takes no change-of-mind or fit
   * returns; the legal reasons always get at least 2 working days.
   */
  returnWindowDays?: number
  /** Shopper emails the brand switched off; every other kind is sent. */
  shopperEmailsOff?: ShopperEmailKind[]
  /** The language shoppers see the store and its emails in; Bahasa Indonesia when unset. */
  storeLanguage?: StoreLanguage
  /** Who the seller is, how shoppers complain, and the brand's own terms choices. */
  legal?: SellerLegal
  /** Delivery days per courier, overriding the platform's estimate. */
  courierEtaDays?: Partial<Record<Courier, EtaDays>>
  /** Whether the brand charges PPN and how. Without it the brand charges none. */
  tax?: TaxSettings
  /**
   * Days the brand is closed besides weekends and public holidays, as YYYY-MM-DD in WIB. Working-day
   * deadlines (the legal return floor, complaint due times) skip them.
   */
  closedDays?: string[]
}

/** A national holiday or cuti bersama, platform-wide. */
export interface PublicHoliday {
  /** YYYY-MM-DD in WIB. */
  date: string
  name: string
  kind: 'national' | 'cuti_bersama'
  /** False while the date still needs checking against the official SKB 3 Menteri text. */
  confirmed: boolean
}

/** How PPN applies to a product: on the 11/12 tax base, on the full price, or not at all. */
export type TaxProfile = 'standard' | 'luxury' | 'exempt'

/** A product or category taxed differently from the brand's default profile. */
export interface TaxOverride {
  kind: 'product' | 'category'
  id: string
  profile: TaxProfile
}

/**
 * The brand's PPN settings. Only a PKP (a business registered for VAT, with an NPWP) charges PPN.
 * Rates live here, so a change in the law is a settings change.
 */
export interface TaxSettings {
  /** Registered as Pengusaha Kena Pajak. Needs an NPWP in the legal details. */
  pkp: boolean
  /** Catalog prices already include PPN; otherwise checkout adds it. */
  pricesIncludeTax: boolean
  /** The profile of every product without an override. */
  profile: TaxProfile
  /** PPN rate in percent; 12 when unset. */
  ratePct?: number
  /** The standard profile's tax base as a fraction of the selling price; 11/12 when unset. */
  dppNumerator?: number
  dppDenominator?: number
  /** Products and categories taxed differently; a product's own override wins over its category's. */
  overrides?: TaxOverride[]
}

/** Whole days a parcel takes, counted from when it ships. */
export interface EtaDays {
  min: number
  max: number
}

/**
 * The seller's identity (PP 80/2019 Pasal 9 and 13), complaint service (Pasal 27) and terms
 * choices (Pasal 53). Every field is optional; the storefront shows what the brand filled in.
 */
export interface SellerLegal {
  /** The registered name, e.g. "PT Lari Nusantara". */
  entityName?: string
  businessType?: BusinessType
  /** Nomor Induk Berusaha, 13 digits. */
  nib?: string
  /** Tax number, 15 or 16 digits. */
  npwp?: string
  address?: string
  /** The city the business is registered in; the default court sits there. */
  city?: string
  /** Customer service phone or WhatsApp. */
  phone?: string
  email?: string
  /** Customer service hours, e.g. "Monday to Friday, 09:00 to 17:00 WIB". */
  hours?: string
  /** How shoppers complain; empty uses the platform's default text. */
  complaintProcedure?: string
  /** Working days the brand takes to resolve a complaint; 3 when unset. */
  complaintDays?: number
  disputeForum?: DisputeForum
  /** The court, BPSK or arbitration body named in the terms; empty uses the brand's city. */
  disputeVenue?: string
  /** The brand's own clauses, appended to the generated terms. */
  termsExtra?: string
}

/** Where a menu link goes: a store page, a category, a collection, the whole catalog, or a link. */
export type MenuTarget =
  | { kind: 'page' | 'category' | 'collection'; id: string }
  | { kind: 'catalog' }
  /** A full https link, or a store path that starts with "/". */
  | { kind: 'url'; url: string }

export interface MenuLink {
  label: string
  target: MenuTarget
}

/** A store's header and footer links, in the order shoppers see them. An empty list keeps the theme's own. */
export interface StoreMenus {
  header: MenuLink[]
  footer: MenuLink[]
}

export interface User {
  id: string
  name: string
  email: string
  title: string
  role: Role
  tenantIds: string[]
  color: string
  /** Disabled accounts cannot sign in. */
  disabled?: boolean
  /** Added by an admin, and has not yet chosen a password from their invitation. */
  invited?: boolean
  /** When the person proved their inbox with a link from email. */
  emailVerifiedAt?: IsoDate
}

/** A person who sells for a tenant through a personal storefront (sales, agent, reseller, affiliate). */
export interface Seller {
  id: string
  tenantId: string
  userId: string | null
  code: string
  name: string
  kind: SellerKind
  slug: string
  status: SellerStatus
  city: string
  bio: string
  headline: string
  whatsapp: string
  instagram: string | null
  templateId: string
  allowedTemplateIds: string[]
  featuredProductIds: string[]
  commissionRate: number
  joinedAt: IsoDate
  color: string
  /** The seller's uploaded photo; without it the storefront shows their initials. */
  photoUrl?: string
}

// --- storefront ---

export interface Template {
  id: string
  /** null for the global library every tenant can use. */
  tenantId: string | null
  name: string
  scope: TemplateScope
  description: string
  bestFor: string
  sections: { kind: SectionKind; rule: SectionRule }[]
}

export interface PageSection {
  id: string
  kind: SectionKind
  rule: SectionRule
  hidden: boolean
  headline: string
  body: string
  productIds: string[]
  ctaLabel: string
  /** An uploaded image for the section; empty means the template's own photo. */
  imageUrl?: string
  /** Where the section's button goes: a store path ("/p/prd-1", "/about") or a full https link. */
  ctaHref?: string
  /** FAQ questions with answers, or testimonial quotes with their author. */
  items?: PageSectionItem[]
  /** Position on the page. Set once the page is arranged by hand; without it the template order applies. */
  order?: number
}

export interface PageSectionItem {
  title: string
  body: string
}

export interface PageRevision {
  id: string
  at: IsoDate
  by: string
  note: string
  sections: PageSection[]
  /** The template the sections were laid out with, so a rollback restores both. */
  templateId: string
}

export interface Page {
  id: string
  tenantId: string
  title: string
  slug: string
  kind: PageKind
  templateId: string
  sellerId: string | null
  status: PageStatus
  sections: PageSection[]
  seo: { title: string; description: string }
  updatedAt: IsoDate
  updatedBy: string
  publishedAt: IsoDate | null
  scheduledAt: IsoDate | null
  revisions: PageRevision[]
  views30d: number
}

/**
 * Changes to a live page that shoppers do not see yet, one row per page (`id` is the page's id).
 * Publishing copies them into the page; staff see them, the storefront never receives them.
 */
export interface PageDraft {
  id: string
  tenantId: string
  sections: PageSection[]
  seo: Page['seo']
  templateId: string
  updatedAt: IsoDate
  updatedBy: string
}

// --- catalog and stock ---

export interface Category {
  id: string
  tenantId: string
  name: string
  description: string
  /** A sub-category points at its parent; top-level categories hold null. */
  parentId: string | null
}

/** A product property the tenant defines once, such as drop, weight or skin type. */
export interface AttributeDef {
  id: string
  tenantId: string
  name: string
  code: string
  type: AttributeType
  unit: string | null
  /** Choices for a select attribute. */
  options: string[]
  /** Shoppers can filter the storefront by it. */
  filterable: boolean
  required: boolean
  /** Categories whose products carry it; empty means every product. */
  categoryIds: string[]
}

export interface ModifierOption {
  id: string
  name: string
  /** Added to the item price when the shopper picks it; 0 for free choices. */
  priceDelta: number
  /** Physical add-ons use their own stock per warehouse. Services can remain untracked. */
  stockTracked?: boolean
}

/** Add-on choices shown with a product at checkout, such as gift wrap or installation. */
export interface ModifierGroup {
  id: string
  tenantId: string
  name: string
  selection: ModifierSelection
  required: boolean
  /** Most options a shopper may pick when selection is multiple. */
  maxChoices: number
  options: ModifierOption[]
  productIds: string[]
}

export interface Collection {
  id: string
  tenantId: string
  name: string
  slug: string
  description: string
  /** Manual collections list products by hand; smart ones fill themselves from their rules. */
  mode: CollectionMode
  productIds: string[]
  /** Smart rules: a product joins when it sits in one of these categories or carries one of these tags. */
  ruleCategoryIds: string[]
  ruleTags: string[]
  /** Shown on the storefront homepage. */
  featured: boolean
}

/** One option dimension of a product, such as Size or Colour, with its values in display order. */
export interface ProductOption {
  name: string
  values: string[]
}

export interface Variant {
  id: string
  sku: string
  /** "42 / Black", joined from optionValues in option order. */
  name: string
  /** Value per option name: { Size: '42', Colour: 'Black' }. Empty for single-variant products. */
  optionValues: Record<string, string>
  price: number
  barcode: string
}

export interface Product {
  id: string
  tenantId: string
  code: string
  name: string
  categoryId: string
  type: ProductType
  status: ProductStatus
  price: number
  compareAt: number | null
  memberPrice: number | null
  cost: number
  tags: string[]
  /** Option dimensions; every combination of their values is one variant. */
  options: ProductOption[]
  /** Attribute values by attribute id, as text ("8", "Road", "yes"). */
  attributes: Record<string, string>
  description: string
  bestFor: string
  variants: Variant[]
  rating: number
  reviewCount: number
  views30d: number
  /** Products sold through Talk to sales instead of the cart. */
  assisted: boolean
  createdAt: IsoDate
  publishAt: IsoDate | null
  /** An uploaded photo; empty means the storefront's stock photo. */
  imageUrl?: string
  /** Shipping weight in grams, set from the product CSV import. */
  weightGrams?: number
}

export interface Warehouse {
  id: string
  tenantId: string
  code: string
  name: string
  city: string
}

export interface StockLevel {
  id: string
  tenantId: string
  variantId: string
  productId: string
  warehouseId: string
  onHand: number
  reserved: number
  safety: number
}

export interface StockMove {
  id: string
  tenantId: string
  variantId: string
  warehouseId: string
  kind: StockMoveKind
  qty: number
  at: IsoDate
  by: string
  note: string
}

export interface ModifierStockLevel {
  id: string
  tenantId: string
  groupId: string
  optionId: string
  warehouseId: string
  onHand: number
  reserved: number
  safety: number
}

export interface ModifierStockMove {
  id: string
  tenantId: string
  groupId: string
  optionId: string
  warehouseId: string
  kind: StockMoveKind
  qty: number
  at: IsoDate
  by: string
  note: string
}

// --- orders ---

export interface OrderLine {
  productId: string
  variantId: string
  qty: number
  /** Unit price, modifiers included. */
  price: number
  /** Add-on choices the shopper picked, priced per unit. */
  modifiers?: { groupId: string; optionId: string; name: string; priceDelta: number }[]
}

export interface OrderEvent {
  id: string
  at: IsoDate
  by: string
  status: OrderStatus | null
  note: string
}

export interface Order {
  id: string
  tenantId: string
  code: string
  customerId: string
  channel: Channel
  /** Sales attribution from a personal store or a ?ref= link. */
  sellerId: string | null
  campaignId: string | null
  status: OrderStatus
  paymentStatus: PaymentStatus
  paymentMethod: PaymentMethod
  courier: Courier
  trackingNo: string | null
  warehouseId: string
  city: string
  lines: OrderLine[]
  subtotal: number
  discount: number
  shipping: number
  total: number
  voucherCode: string | null
  /** The payment type picked at checkout; null for orders from before payment types existed. */
  paymentTypeId?: string | null
  /** Each promotion the order earned and its amount; their sum is `discount`. */
  discountLines?: { promotionId: string; label: string; amount: number }[]
  pointsEarned: number
  createdAt: IsoDate
  cancelReason: CancelReason | null
  refundedAmount: number
  events: OrderEvent[]
  /** Set when a buying agent placed the order for the customer. */
  agent?: AgentOrderInfo
  /** The version of the store's terms the shopper agreed to at checkout. */
  termsVersion?: string
  /** When the shopper agreed; the API stamps its own clock. */
  termsAcceptedAt?: IsoDate
  /** The shopper's word that they paid by manual transfer or static QRIS; staff confirm or reject it. */
  paymentConfirmation?: PaymentConfirmation
  /** The money a cancellation owes the shopper and how it went back. */
  cancelRefund?: CancelRefund
  /** The PPN on the order, with the rates at the time; only orders of a PKP brand carry it. */
  tax?: OrderTax
}

/** One order line's share of the tax: `net` excludes PPN, and net + ppn is what the line costs. */
export interface OrderTaxLine {
  profile: TaxProfile
  /** The line after its share of the discount, without PPN. */
  net: number
  /** Dasar Pengenaan Pajak, the tax base. */
  dpp: number
  ppn: number
}

/** The PPN of an order. Lines follow the order's lines; the totals are the sums of the lines. */
export interface OrderTax {
  pricesIncludeTax: boolean
  ratePct: number
  dppNumerator: number
  dppDenominator: number
  lines: OrderTaxLine[]
  dpp: number
  ppn: number
}

/** What a shopper reports after paying by manual transfer or static QRIS. Only staff turn the order paid. */
export interface PaymentConfirmation {
  amount: number
  /** The bank or wallet the money came from. */
  channel: string
  senderName: string
  transferredAt: string
  proofUrl?: string
  submittedAt: IsoDate
  status: PaymentConfirmationStatus
  reviewedAt?: IsoDate
  reviewedBy?: string
  rejectReason?: string
}

/** The refund a cancelled paid order owes, and how far it got. */
export interface CancelRefund {
  amount: number
  status: CancelRefundStatus
  /** midtrans when the gateway refunded, manual when staff recorded a bank transfer. */
  method?: ReturnRefundMethod
  reference?: string
  refundedOn?: string
  error?: string
}

/** The mandate chain behind an agent order: what the shopper asked for and how the agent closed it. */
export interface AgentOrderInfo {
  kind: AgentKind
  /** The shopper's instruction, as given to the agent. */
  intent: string
  intentMandateId: string
  cartMandateId: string
  paymentMandateId: string
  /** Extra discount the agent negotiated under the store's agent policy, in rupiah. */
  negotiated: number
  /** Products the agent compared before it chose. */
  compared: number
}

/** A store's rules for buying agents. */
export interface AgentPolicy {
  tenantId: string
  enabled: boolean
  /** Agents may ask for an extra discount; the store grants up to this percentage on its own. */
  negotiation: boolean
  maxAutoDiscountPct: number
  /** Payment types an agent may use; empty means every enabled type. */
  paymentTypeIds: string[]
  /** Agent kinds the store accepts. */
  kinds: AgentKind[]
  updatedAt: IsoDate
}

// --- customers and CRM ---

export interface Customer {
  id: string
  tenantId: string
  code: string
  name: string
  email: string
  phone: string
  city: string
  source: Channel
  stage: LifecycleStage
  tier: LoyaltyTier
  points: number
  tags: string[]
  interests: string[]
  sellerId: string | null
  createdAt: IsoDate
  birthday: string | null
  color: string
  /** The shopper's last answer about offers and news; absent means never asked. */
  marketingConsent?: MarketingConsent
  /** When the customer's personal data was replaced with placeholders. */
  erasedAt?: IsoDate
}

/** Proof of marketing consent: the answer, when, where it was given and which wording the shopper saw. */
export interface MarketingConsent {
  granted: boolean
  at: IsoDate
  source: ConsentSource
  textVersion: string
}

export interface CustomerEvent {
  id: string
  tenantId: string
  customerId: string
  kind: CustomerEventKind
  at: IsoDate
  label: string
  productId: string | null
  orderId: string | null
  campaignId: string | null
  by: string | null
}

export interface SegmentRule {
  field: SegmentField
  op: SegmentOp
  value: string
}

export interface Segment {
  id: string
  tenantId: string
  name: string
  description: string
  builtIn: boolean
  match: 'all' | 'any'
  rules: SegmentRule[]
  createdAt: IsoDate
}

export interface Lead {
  id: string
  tenantId: string
  code: string
  name: string
  company: string
  phone: string
  productId: string | null
  value: number
  stage: LeadStage
  source: LeadSource
  sellerId: string | null
  customerId: string | null
  note: string
  createdAt: IsoDate
  updatedAt: IsoDate
  lostReason: string | null
}

export interface Ticket {
  id: string
  tenantId: string
  code: string
  customerId: string
  orderId: string | null
  kind: TicketKind
  status: TicketStatus
  subject: string
  channel: 'whatsapp' | 'chat' | 'email' | 'web'
  assigneeId: string | null
  createdAt: IsoDate
  slaDueAt: IsoDate
  resolvedAt: IsoDate | null
  /** What the shopper wrote, for a ticket opened from the storefront's complaint form. */
  message?: string
  /** How to reach the shopper; a guest's ticket has no customer record. */
  contact?: TicketContact
}

export interface TicketContact {
  name: string
  email: string
  phone: string
}

// --- returns ---

export interface ReturnItem {
  productId: string
  variantId: string
  qty: number
  reason: ReturnReason
}

export interface ReturnEvent {
  id: string
  at: IsoDate
  by: string
  status: ReturnStatus | null
  note: string
}

/** A request to send bought items back for a refund (an RMA), with its own lifecycle. */
export interface OrderReturn {
  id: string
  tenantId: string
  code: string
  orderId: string
  customerId: string
  items: ReturnItem[]
  /** The main reason, shown in lists. */
  reason: ReturnReason
  note: string
  status: ReturnStatus
  /** Who asked for it. */
  requestedBy: 'staff' | 'shopper'
  /** What was refunded; 0 until the refund step. */
  refundAmount: number
  /** Whether the received units went back on the shelf. */
  restock: boolean
  /** Why staff rejected it. */
  rejectReason?: string
  /** Who pays to send it back, fixed when it was requested. */
  shippingPaidBy?: ReturnShippingPayer
  /** The return shipping cost the brand added to the refund; part of refundAmount. */
  refundShipping?: number
  /** How the money went back. */
  refundMethod?: ReturnRefundMethod
  /** The gateway's refund reference, or the bank transfer reference staff recorded. */
  refundReference?: string
  /** When the money went back: the gateway's answer, or the transfer date staff recorded. */
  refundedOn?: string
  /**
   * The last gateway refund attempt: succeeded; failed with gatewayError, after which staff may record
   * a bank transfer; or pending when the gateway did not answer and the refund is retried.
   */
  gatewayStatus?: 'succeeded' | 'failed' | 'pending'
  gatewayError?: string
  events: ReturnEvent[]
  createdAt: IsoDate
}

// --- growth ---

export type Funnel = Record<FunnelStep, number>

export interface Campaign {
  id: string
  tenantId: string
  code: string
  name: string
  goal: string
  status: CampaignStatus
  channels: MessageChannel[]
  segmentId: string | null
  promotionId: string | null
  pageId: string | null
  startAt: IsoDate
  endAt: IsoDate
  budget: number
  funnel: Funnel
  revenue: number
  createdBy: string
}

export interface AutomationStep {
  id: string
  kind: AutomationStepKind
  detail: string
}

export interface Automation {
  id: string
  tenantId: string
  name: string
  description: string
  status: AutomationStatus
  trigger: AutomationTrigger
  triggerDetail: string
  steps: AutomationStep[]
  enrolled30d: number
  converted30d: number
  revenue30d: number
  updatedAt: IsoDate
}

export interface Promotion {
  id: string
  tenantId: string
  code: string
  name: string
  kind: PromotionKind
  /** Automatic promotions apply in the cart by themselves; code promotions need the shopper to enter the code. */
  trigger: PromotionTrigger
  /** Percent for percentage offers, Rupiah for fixed offers and bundle prices. */
  value: number
  /** Cap on a percentage discount, in Rupiah. */
  maxDiscount: number | null
  /** Buy X get Y: units to buy, units given, and the discount on the given units (100 = free). */
  buyQty: number | null
  getQty: number | null
  getDiscountPct: number | null
  minSpend: number
  segmentId: string | null
  /** Scope: the offer counts only these categories (sub-categories included) or products. Empty means everything. */
  categoryIds: string[]
  productIds: string[]
  /** Only when the shopper pays with one of these payment types. Empty means any payment. */
  paymentTypeIds: string[]
  status: PromotionStatus
  startAt: IsoDate
  endAt: IsoDate
  usageLimit: number | null
  used: number
  revenue: number
  /** Promotions made only for one personal store. */
  sellerId: string | null
}

// --- platform ---

/** A way to pay that the tenant offers at checkout, with its gateway, fee and limits. */
export interface PaymentType {
  id: string
  tenantId: string
  name: string
  method: PaymentMethod
  provider: string
  enabled: boolean
  /** Gateway fee the tenant pays: percent of the order plus a fixed amount. */
  feePercent: number
  feeFixed: number
  minAmount: number
  maxAmount: number | null
  /** Shown to the shopper after they pick it. */
  instructions: string
  sort: number
}

export interface Integration {
  id: string
  tenantId: string
  provider: string
  category: IntegrationCategory
  health: IntegrationHealth
  enabled: boolean
  endpoint: string
  lastSyncAt: IsoDate | null
  events24h: number
  errors24h: number
  note: string
}

export interface IntegrationLog {
  id: string
  tenantId: string
  integrationId: string
  at: IsoDate
  direction: 'inbound' | 'outbound'
  event: WebhookEvent | string
  path: string
  ok: boolean
  ms: number
  summary: string
}

/** Daily storefront traffic, per tenant and optionally per personal store. */
export interface TrafficDay {
  id: string
  tenantId: string
  sellerId: string | null
  day: string
  visitors: number
  pageViews: number
  carts: number
  checkouts: number
  /** Sessions opened by buying agents rather than people. */
  agentVisits?: number
}

/** A search the storefront could not answer, for zero-result analytics. */
export interface SearchTerm {
  id: string
  tenantId: string
  term: string
  count30d: number
  results: number
  /** Searches per WIB day (YYYY-MM-DD) over the last 30 days; count30d is their sum. */
  days?: Record<string, number>
  /** When a shopper last searched the term. */
  lastSearchedAt?: IsoDate
}

/**
 * Read model from the API: one customer's order count, spend and recency from sold orders, what
 * they bought per product, and their last abandoned checkout and purchase. The console reads these
 * instead of every order and every event. Times are ISO strings or null.
 */
export interface CustomerMetricsRow {
  id: string
  tenantId: string
  customerId: string
  orders: number
  spend: number
  firstAt: string | null
  lastAt: string | null
  productCounts: Record<string, number>
  lastAbandonedAt: string | null
  lastPurchaseEventAt: string | null
  /** Months with a sold order, YYYY-MM in WIB, oldest first; cohorts read them. */
  buyMonths: string[]
}

/**
 * Read model: sold orders and net revenue per WIB day, channel, seller and campaign. KPIs, revenue
 * charts, channel mix and seller and campaign revenue sum these instead of reading every order.
 */
export interface SalesDay {
  id: string
  tenantId: string
  /** YYYY-MM-DD in WIB. */
  day: string
  channel: Channel
  sellerId: string | null
  campaignId: string | null
  orders: number
  /** Net of refunds. */
  revenue: number
}

/** Read model: units, line revenue and orders per product per WIB day, from sold orders. */
export interface ProductDay {
  id: string
  tenantId: string
  day: string
  productId: string
  units: number
  /** Quantity times line price, before order discounts, as product performance counts it. */
  revenue: number
  orders: number
}

/** Read model: sold orders per seller, customer and WIB day, for repeat buyers per seller. */
export interface SellerBuyer {
  id: string
  tenantId: string
  sellerId: string
  customerId: string
  day: string
  orders: number
}

/**
 * Read model: sales_days rolled up per WIB month for months older than the daily window. The console
 * state never carries these; GET /views/sales-months serves them.
 */
export interface SalesMonth {
  /** YYYY-MM in WIB. */
  month: string
  channel: Channel
  sellerId: string | null
  campaignId: string | null
  orders: number
  revenue: number
}

/** Read model: product_days rolled up per WIB month, served by GET /views/product-months. */
export interface ProductMonth {
  month: string
  productId: string
  units: number
  revenue: number
  orders: number
}

/** A shopper's request about their personal data, answered within 3x24 hours (UU PDP). */
export interface PrivacyRequest {
  id: string
  tenantId: string
  customerId: string
  kind: PrivacyRequestKind
  status: 'open' | 'completed'
  requestedAt: IsoDate
  dueAt: IsoDate
  completedAt: IsoDate | null
  handledBy: string | null
  note: string
}
