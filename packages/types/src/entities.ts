import type {
  AutomationStatus,
  AutomationStepKind,
  AttributeType,
  AutomationTrigger,
  BrandLockKey,
  BrandPersonality,
  ButtonStyle,
  CampaignStatus,
  CollectionMode,
  CancelReason,
  Channel,
  Courier,
  CustomerEventKind,
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
  Role,
  SectionKind,
  SectionRule,
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
  /** Onboarding steps the tenant has finished, in order. */
  onboarding: string[]
}

export interface User {
  id: string
  name: string
  email: string
  title: string
  role: Role
  tenantIds: string[]
  color: string
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
  channel: 'whatsapp' | 'chat' | 'email'
  assigneeId: string | null
  createdAt: IsoDate
  slaDueAt: IsoDate
  resolvedAt: IsoDate | null
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
}

/** A search the storefront could not answer, for zero-result analytics. */
export interface SearchTerm {
  id: string
  tenantId: string
  term: string
  count30d: number
  results: number
}
