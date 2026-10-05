// Domain unions for Commerce OS. Each union has a *_LABEL map beside it, and lifecycles a *_FLOW.

export type IsoDate = string

// --- people and access ---
export type Role = 'platform_admin' | 'tenant_admin' | 'marketing' | 'operations' | 'service' | 'sales'
export const ROLE_LABEL: Record<Role, string> = {
  platform_admin: 'Platform admin',
  tenant_admin: 'Tenant admin',
  marketing: 'Marketing',
  operations: 'Commerce operations',
  service: 'Customer service',
  sales: 'Sales agent',
}

export type SellerStatus = 'active' | 'invited' | 'suspended'
export const SELLER_STATUS_LABEL: Record<SellerStatus, string> = {
  active: 'Active',
  invited: 'Invited',
  suspended: 'Suspended',
}

export type SellerKind = 'sales' | 'agent' | 'reseller' | 'affiliate'
export const SELLER_KIND_LABEL: Record<SellerKind, string> = {
  sales: 'In-house sales',
  agent: 'Agent',
  reseller: 'Reseller',
  affiliate: 'Affiliate',
}

// --- tenant and brand ---
export type Industry = 'sport' | 'beauty' | 'industrial' | 'fnb' | 'fashion' | 'electronics'
export const INDUSTRY_LABEL: Record<Industry, string> = {
  sport: 'Sport & running',
  beauty: 'Beauty',
  industrial: 'Industrial B2B',
  fnb: 'Food & beverage',
  fashion: 'Fashion',
  electronics: 'Electronics',
}

export type TenantPlan = 'starter' | 'growth' | 'enterprise'
export const TENANT_PLAN_LABEL: Record<TenantPlan, string> = {
  starter: 'Starter',
  growth: 'Growth',
  enterprise: 'Enterprise',
}

export type BrandPersonality =
  'minimal' | 'premium' | 'corporate' | 'modern' | 'playful' | 'bold' | 'editorial' | 'lifestyle'
export const BRAND_PERSONALITY_LABEL: Record<BrandPersonality, string> = {
  minimal: 'Minimal',
  premium: 'Premium',
  corporate: 'Corporate',
  modern: 'Modern',
  playful: 'Playful',
  bold: 'Bold',
  editorial: 'Editorial',
  lifestyle: 'Lifestyle',
}

export type ToneOfVoice = 'formal' | 'friendly' | 'casual' | 'professional' | 'premium' | 'energetic'
export const TONE_OF_VOICE_LABEL: Record<ToneOfVoice, string> = {
  formal: 'Formal',
  friendly: 'Friendly',
  casual: 'Casual',
  professional: 'Professional',
  premium: 'Premium',
  energetic: 'Energetic',
}

/** Storefront look. Every theme reads the same brand tokens and page content. */
export type StorefrontTheme = 'theme1' | 'theme2'
export const STOREFRONT_THEME_LABEL: Record<StorefrontTheme, string> = {
  theme1: 'Theme 1 · Marketplace',
  theme2: 'Theme 2 · Showcase',
}
export const STOREFRONT_THEME_DESCRIPTION: Record<StorefrontTheme, string> = {
  theme1:
    'Search-first marketplace: category sidebar, deals countdown, dense product rows. Fits large catalogs.',
  theme2:
    'Bold showcase on desktop and an editorial look on phones, with a shopping assistant chat. Fits curated catalogs.',
}

export type RadiusScale = 'sharp' | 'soft' | 'round'
export const RADIUS_SCALE_LABEL: Record<RadiusScale, string> = {
  sharp: 'Sharp',
  soft: 'Soft',
  round: 'Round',
}

export type ButtonStyle = 'solid' | 'outline' | 'pill'
export const BUTTON_STYLE_LABEL: Record<ButtonStyle, string> = {
  solid: 'Solid',
  outline: 'Outline',
  pill: 'Pill',
}

/** Brand settings a tenant can lock so sellers and campaign pages cannot change them. */
export type BrandLockKey =
  'logo' | 'primary_color' | 'button_style' | 'hero_image' | 'headline' | 'featured_product' | 'layout'
export const BRAND_LOCK_LABEL: Record<BrandLockKey, string> = {
  logo: 'Logo',
  primary_color: 'Primary colour',
  button_style: 'Button style',
  hero_image: 'Hero image',
  headline: 'Headline',
  featured_product: 'Featured products',
  layout: 'Page layout',
}
export const BRAND_LOCK_KEYS = Object.keys(BRAND_LOCK_LABEL) as BrandLockKey[]

// --- storefront ---
export type PageKind =
  'home' | 'collection' | 'product' | 'landing' | 'campaign' | 'about' | 'faq' | 'personal'
export const PAGE_KIND_LABEL: Record<PageKind, string> = {
  home: 'Homepage',
  collection: 'Collection',
  product: 'Product detail',
  landing: 'Landing page',
  campaign: 'Campaign',
  about: 'About',
  faq: 'FAQ',
  personal: 'Personal store',
}

export type PageStatus = 'draft' | 'scheduled' | 'published'
export const PAGE_STATUS_LABEL: Record<PageStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  published: 'Published',
}

export type SectionKind =
  | 'hero'
  | 'category'
  | 'featured_product'
  | 'collection'
  | 'promotion'
  | 'countdown'
  | 'testimonials'
  | 'comparison'
  | 'brand_story'
  | 'faq'
  | 'cta'
  | 'footer'
export const SECTION_KIND_LABEL: Record<SectionKind, string> = {
  hero: 'Hero',
  category: 'Shop by category',
  featured_product: 'Featured products',
  collection: 'Collection grid',
  promotion: 'Promotion banner',
  countdown: 'Countdown',
  testimonials: 'Testimonials',
  comparison: 'Product comparison',
  brand_story: 'Brand story',
  faq: 'FAQ',
  cta: 'Call to action',
  footer: 'Footer',
}

/** How a template treats a section: sellers may not remove required sections or edit locked ones. */
export type SectionRule = 'required' | 'optional' | 'locked'
export const SECTION_RULE_LABEL: Record<SectionRule, string> = {
  required: 'Required',
  optional: 'Optional',
  locked: 'Locked',
}

export type TemplateScope = 'store' | 'campaign' | 'personal'
export const TEMPLATE_SCOPE_LABEL: Record<TemplateScope, string> = {
  store: 'Main store',
  campaign: 'Campaign & launch',
  personal: 'Personal seller',
}

export type Device = 'desktop' | 'tablet' | 'mobile'
export const DEVICE_LABEL: Record<Device, string> = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' }

// --- catalog ---
export type ProductStatus = 'draft' | 'scheduled' | 'active' | 'archived'
export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  active: 'Active',
  archived: 'Archived',
}

export type ProductType = 'physical' | 'digital' | 'service' | 'bundle' | 'subscription' | 'preorder'
export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  physical: 'Physical',
  digital: 'Digital',
  service: 'Service',
  bundle: 'Bundle',
  subscription: 'Subscription',
  preorder: 'Pre-order',
}

export type AttributeType = 'text' | 'number' | 'select' | 'boolean'
export const ATTRIBUTE_TYPE_LABEL: Record<AttributeType, string> = {
  text: 'Text',
  number: 'Number',
  select: 'Choice list',
  boolean: 'Yes or no',
}

export type ModifierSelection = 'single' | 'multiple'
export const MODIFIER_SELECTION_LABEL: Record<ModifierSelection, string> = {
  single: 'Pick one',
  multiple: 'Pick several',
}

export type StockState = 'in_stock' | 'low' | 'out' | 'untracked'
export const STOCK_STATE_LABEL: Record<StockState, string> = {
  in_stock: 'In stock',
  low: 'Low stock',
  out: 'Out of stock',
  untracked: 'Not tracked',
}

export type StockMoveKind = 'receipt' | 'adjustment' | 'transfer' | 'sale' | 'return'
export const STOCK_MOVE_KIND_LABEL: Record<StockMoveKind, string> = {
  receipt: 'Receipt',
  adjustment: 'Adjustment',
  transfer: 'Transfer',
  sale: 'Sale',
  return: 'Return',
}

// --- orders ---
export type OrderStatus =
  | 'new'
  | 'confirmed'
  | 'paid'
  | 'processing'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'returned'
  | 'refunded'
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'New',
  confirmed: 'Confirmed',
  paid: 'Paid',
  processing: 'Processing',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  returned: 'Returned',
  refunded: 'Refunded',
}
export const ORDER_STATUS_FLOW: OrderStatus[] = [
  'new',
  'confirmed',
  'paid',
  'processing',
  'packed',
  'shipped',
  'delivered',
  'completed',
]
export const OPEN_ORDER_STATUSES: OrderStatus[] = [
  'new',
  'confirmed',
  'paid',
  'processing',
  'packed',
  'shipped',
]
/** Statuses that count as revenue. */
export const SOLD_ORDER_STATUSES: OrderStatus[] = [
  'paid',
  'processing',
  'packed',
  'shipped',
  'delivered',
  'completed',
]

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Awaiting payment',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
}

export type PaymentMethod = 'qris' | 'va' | 'bank_transfer' | 'credit_card' | 'ewallet' | 'paylater' | 'cod'
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  qris: 'QRIS',
  va: 'Virtual account',
  bank_transfer: 'Bank transfer',
  credit_card: 'Credit card',
  ewallet: 'E-wallet',
  paylater: 'PayLater',
  cod: 'Cash on delivery',
}

export type Courier = 'jne' | 'jnt' | 'sicepat' | 'grab' | 'gojek' | 'lalamove' | 'pickup'
export const COURIER_LABEL: Record<Courier, string> = {
  jne: 'JNE',
  jnt: 'J&T',
  sicepat: 'SiCepat',
  grab: 'GrabExpress',
  gojek: 'GoSend',
  lalamove: 'Lalamove',
  pickup: 'Store pickup',
}

export type Channel = 'web' | 'personal_store' | 'whatsapp' | 'marketplace' | 'pos'
export const CHANNEL_LABEL: Record<Channel, string> = {
  web: 'Website',
  personal_store: 'Personal store',
  whatsapp: 'WhatsApp',
  marketplace: 'Marketplace',
  pos: 'Offline store',
}

export type CancelReason =
  'customer_request' | 'payment_expired' | 'out_of_stock' | 'fraud_check' | 'duplicate'
export const CANCEL_REASON_LABEL: Record<CancelReason, string> = {
  customer_request: 'Customer asked to cancel',
  payment_expired: 'Payment expired',
  out_of_stock: 'Out of stock',
  fraud_check: 'Failed fraud check',
  duplicate: 'Duplicate order',
}

// --- customers and CRM ---
export type LifecycleStage =
  'visitor' | 'lead' | 'registered' | 'first_buyer' | 'repeat_buyer' | 'loyal' | 'vip' | 'at_risk' | 'dormant'
export const LIFECYCLE_STAGE_LABEL: Record<LifecycleStage, string> = {
  visitor: 'Visitor',
  lead: 'Lead',
  registered: 'Registered',
  first_buyer: 'First buyer',
  repeat_buyer: 'Repeat buyer',
  loyal: 'Loyal customer',
  vip: 'VIP',
  at_risk: 'At risk',
  dormant: 'Dormant',
}
export const LIFECYCLE_FLOW: LifecycleStage[] = [
  'visitor',
  'lead',
  'registered',
  'first_buyer',
  'repeat_buyer',
  'loyal',
  'vip',
]

export type LoyaltyTier = 'member' | 'silver' | 'gold' | 'platinum'
export const LOYALTY_TIER_LABEL: Record<LoyaltyTier, string> = {
  member: 'Member',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
}
export const LOYALTY_TIER_FLOW: LoyaltyTier[] = ['member', 'silver', 'gold', 'platinum']

export type CustomerEventKind =
  | 'registered'
  | 'product_viewed'
  | 'search'
  | 'collection_viewed'
  | 'wishlist'
  | 'add_to_cart'
  | 'checkout_started'
  | 'checkout_abandoned'
  | 'purchase'
  | 'campaign_opened'
  | 'campaign_click'
  | 'review'
  | 'support'
  | 'tier_upgraded'
  | 'points_earned'
  | 'note'
export const CUSTOMER_EVENT_LABEL: Record<CustomerEventKind, string> = {
  registered: 'Registered',
  product_viewed: 'Viewed product',
  search: 'Searched',
  collection_viewed: 'Viewed collection',
  wishlist: 'Added to wishlist',
  add_to_cart: 'Added to cart',
  checkout_started: 'Started checkout',
  checkout_abandoned: 'Abandoned checkout',
  purchase: 'Purchased',
  campaign_opened: 'Opened campaign',
  campaign_click: 'Clicked campaign',
  review: 'Wrote a review',
  support: 'Contacted support',
  tier_upgraded: 'Tier upgraded',
  points_earned: 'Earned points',
  note: 'Note',
}

export type SegmentField =
  'orders' | 'spend' | 'days_since_purchase' | 'tier' | 'stage' | 'interest' | 'city' | 'abandoned_cart'
export const SEGMENT_FIELD_LABEL: Record<SegmentField, string> = {
  orders: 'Order count',
  spend: 'Lifetime spend',
  days_since_purchase: 'Days since last purchase',
  tier: 'Loyalty tier',
  stage: 'Lifecycle stage',
  interest: 'Interest (category)',
  city: 'City',
  abandoned_cart: 'Abandoned cart (last 7 days)',
}
export type SegmentOp = 'gt' | 'lt' | 'eq'
export const SEGMENT_OP_LABEL: Record<SegmentOp, string> = { gt: 'more than', lt: 'less than', eq: 'is' }

export type LeadStage = 'new' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'
export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  new: 'New lead',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
}
export const LEAD_STAGE_FLOW: LeadStage[] = ['new', 'qualified', 'proposal', 'negotiation', 'won']
export const OPEN_LEAD_STAGES: LeadStage[] = ['new', 'qualified', 'proposal', 'negotiation']

export type LeadSource = 'talk_to_sales' | 'personal_store' | 'whatsapp' | 'event' | 'referral'
export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  talk_to_sales: 'Talk to sales form',
  personal_store: 'Personal store',
  whatsapp: 'WhatsApp',
  event: 'Event',
  referral: 'Referral',
}

export type TicketKind = 'question' | 'complaint' | 'return' | 'refund'
export const TICKET_KIND_LABEL: Record<TicketKind, string> = {
  question: 'Question',
  complaint: 'Complaint',
  return: 'Return',
  refund: 'Refund',
}
export type TicketStatus = 'open' | 'pending' | 'resolved'
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  pending: 'Waiting on customer',
  resolved: 'Resolved',
}

// --- growth ---
export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed'
export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
}
export const CAMPAIGN_STATUS_FLOW: CampaignStatus[] = ['draft', 'scheduled', 'running', 'completed']

export type MessageChannel = 'email' | 'whatsapp' | 'push' | 'sms' | 'web_banner' | 'landing_page'
export const MESSAGE_CHANNEL_LABEL: Record<MessageChannel, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  push: 'Push notification',
  sms: 'SMS',
  web_banner: 'Web banner',
  landing_page: 'Landing page',
}

/** The campaign funnel, from message sent to purchase. */
export type FunnelStep =
  'sent' | 'delivered' | 'opened' | 'clicked' | 'visited' | 'carted' | 'checkout' | 'purchased'
export const FUNNEL_STEP_LABEL: Record<FunnelStep, string> = {
  sent: 'Sent',
  delivered: 'Delivered',
  opened: 'Opened',
  clicked: 'Clicked',
  visited: 'Visited',
  carted: 'Added to cart',
  checkout: 'Checkout',
  purchased: 'Purchased',
}
export const FUNNEL_FLOW: FunnelStep[] = [
  'sent',
  'delivered',
  'opened',
  'clicked',
  'visited',
  'carted',
  'checkout',
  'purchased',
]

export type AutomationStatus = 'draft' | 'active' | 'paused'
export const AUTOMATION_STATUS_LABEL: Record<AutomationStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
}

export type AutomationTrigger =
  | 'registered'
  | 'first_order'
  | 'order_delivered'
  | 'cart_abandoned'
  | 'birthday'
  | 'no_purchase'
  | 'enter_segment'
  | 'tier_upgraded'
  | 'product_viewed'
export const AUTOMATION_TRIGGER_LABEL: Record<AutomationTrigger, string> = {
  registered: 'Customer registered',
  first_order: 'First order placed',
  order_delivered: 'Order delivered',
  cart_abandoned: 'Cart abandoned',
  birthday: 'Birthday',
  no_purchase: 'No purchase for X days',
  enter_segment: 'Customer enters segment',
  tier_upgraded: 'Tier upgraded',
  product_viewed: 'Product viewed X times',
}

export type AutomationStepKind =
  | 'wait'
  | 'condition'
  | 'send_email'
  | 'send_whatsapp'
  | 'push'
  | 'give_voucher'
  | 'add_points'
  | 'add_tag'
  | 'notify_sales'
export const AUTOMATION_STEP_LABEL: Record<AutomationStepKind, string> = {
  wait: 'Wait',
  condition: 'Check condition',
  send_email: 'Send email',
  send_whatsapp: 'Send WhatsApp',
  push: 'Push notification',
  give_voucher: 'Give voucher',
  add_points: 'Add points',
  add_tag: 'Add tag',
  notify_sales: 'Notify sales',
}

export type PromotionKind = 'percentage' | 'fixed' | 'bxgy' | 'free_shipping' | 'bundle'
export const PROMOTION_KIND_LABEL: Record<PromotionKind, string> = {
  percentage: 'Percentage discount',
  fixed: 'Nominal discount',
  bxgy: 'Buy X get Y',
  free_shipping: 'Free shipping',
  bundle: 'Bundle price',
}

export type PromotionTrigger = 'automatic' | 'code'
export const PROMOTION_TRIGGER_LABEL: Record<PromotionTrigger, string> = {
  automatic: 'Automatic in the cart',
  code: 'With a code',
}

export type CollectionMode = 'manual' | 'smart'
export const COLLECTION_MODE_LABEL: Record<CollectionMode, string> = {
  manual: 'Manual',
  smart: 'Smart',
}

export type PromotionStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'expired'
export const PROMOTION_STATUS_LABEL: Record<PromotionStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  active: 'Active',
  paused: 'Paused',
  expired: 'Expired',
}

// --- platform ---
export type IntegrationCategory = 'payment' | 'logistics' | 'enterprise' | 'marketing' | 'marketplace'
export const INTEGRATION_CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  payment: 'Payment',
  logistics: 'Logistics',
  enterprise: 'ERP & POS',
  marketing: 'Messaging',
  marketplace: 'Marketplace',
}

export type IntegrationHealth = 'connected' | 'degraded' | 'failing' | 'off'
export const INTEGRATION_HEALTH_LABEL: Record<IntegrationHealth, string> = {
  connected: 'Connected',
  degraded: 'Degraded',
  failing: 'Failing',
  off: 'Off',
}

export type WebhookEvent =
  | 'order.created'
  | 'order.paid'
  | 'order.shipped'
  | 'customer.created'
  | 'customer.updated'
  | 'product.updated'
  | 'inventory.updated'
