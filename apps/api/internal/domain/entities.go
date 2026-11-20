// Package domain mirrors packages/types: the same entities with the same JSON field names, so the
// API, the database documents and the three apps read one shape.
package domain

// IsoDate is an ISO-8601 timestamp with the WIB offset, e.g. 2026-10-05T09:41:00+07:00.
type IsoDate = string

// --- platform and tenants ---

type BrandColors struct {
	Primary    string `json:"primary"`
	Secondary  string `json:"secondary"`
	Accent     string `json:"accent"`
	Background string `json:"background"`
	Text       string `json:"text"`
}

type BrandFonts struct {
	Heading string `json:"heading"`
	Body    string `json:"body"`
}

type BrandConfig struct {
	Colors      BrandColors     `json:"colors"`
	Fonts       BrandFonts      `json:"fonts"`
	Theme       string          `json:"theme"`
	Radius      string          `json:"radius"`
	ButtonStyle string          `json:"buttonStyle"`
	Personality string          `json:"personality"`
	Tone        string          `json:"tone"`
	Tagline     string          `json:"tagline"`
	Locks       map[string]bool `json:"locks"`
	// LogoURL is an uploaded logo; empty means the storefront draws its own mark.
	LogoURL *string `json:"logoUrl,omitempty"`
}

type LoyaltyThresholds struct {
	Silver   int `json:"silver"`
	Gold     int `json:"gold"`
	Platinum int `json:"platinum"`
}

type LoyaltyConfig struct {
	PointsPer10k    int               `json:"pointsPer10k"`
	Thresholds      LoyaltyThresholds `json:"thresholds"`
	FreeShippingMin int               `json:"freeShippingMin"`
}

type Tenant struct {
	ID               string        `json:"id"`
	Code             string        `json:"code"`
	Name             string        `json:"name"`
	Industry         string        `json:"industry"`
	Plan             string        `json:"plan"`
	Subdomain        string        `json:"subdomain"`
	Domain           *string       `json:"domain"`
	DomainVerified   bool          `json:"domainVerified"`
	CreatedAt        IsoDate       `json:"createdAt"`
	Brand            BrandConfig   `json:"brand"`
	Loyalty          LoyaltyConfig `json:"loyalty"`
	ShippingCouriers []string      `json:"shippingCouriers,omitempty"`
	Onboarding       []string      `json:"onboarding"`
	// Source is "signup" for a store its owner created from the public sign-up page.
	Source string `json:"source,omitempty"`
	// DisplayCurrencies are the extra currencies shoppers may see estimated prices in. Stores still
	// sell and charge in rupiah.
	DisplayCurrencies []string `json:"displayCurrencies,omitempty"`
	// DomainToken is the value the brand puts in a TXT record at _wit-commerce.{domain} to prove
	// the domain is theirs.
	DomainToken string `json:"domainToken,omitempty"`
	// DomainVerifiedAt is when DNS proved the custom domain. Only a domain with this time is served
	// and linked to.
	DomainVerifiedAt IsoDate `json:"domainVerifiedAt,omitempty"`
	// DomainCheckedAt is when the daily job last re-checked a verified domain's DNS, and
	// DomainCheckFailures how many of those checks failed in a row.
	DomainCheckedAt     IsoDate `json:"domainCheckedAt,omitempty"`
	DomainCheckFailures int     `json:"domainCheckFailures,omitempty"`
	// Menus are the store's own header and footer links; nil keeps the theme's fixed links.
	Menus *StoreMenus `json:"menus,omitempty"`
	// ReturnWindowDays is how long after delivery a shopper may ask for a return; nil means 7.
	ReturnWindowDays *int `json:"returnWindowDays,omitempty"`
	// ShopperEmailsOff lists the shopper emails the brand switched off.
	ShopperEmailsOff []string `json:"shopperEmailsOff,omitempty"`
	// StoreLanguage is the language shoppers see the store and its emails in: "id" or "en"; empty means "id".
	StoreLanguage string `json:"storeLanguage,omitempty"`
	// Legal is who the seller is, how shoppers complain and the brand's terms choices.
	Legal *SellerLegal `json:"legal,omitempty"`
	// CourierEtaDays overrides the platform's delivery estimate per courier.
	CourierEtaDays map[string]EtaDays `json:"courierEtaDays,omitempty"`
	// Tax is whether the brand charges PPN and how; nil charges none.
	Tax *TaxSettings `json:"tax,omitempty"`
}

// TaxSettings mirrors TaxSettings in packages/types: the brand's PPN settings. Only a PKP with an
// NPWP charges PPN. Nil rates mean the defaults in rules/tax.go.
type TaxSettings struct {
	PKP              bool          `json:"pkp"`
	PricesIncludeTax bool          `json:"pricesIncludeTax"`
	Profile          string        `json:"profile"`
	RatePct          *float64      `json:"ratePct,omitempty"`
	DppNumerator     *int          `json:"dppNumerator,omitempty"`
	DppDenominator   *int          `json:"dppDenominator,omitempty"`
	Overrides        []TaxOverride `json:"overrides,omitempty"`
}

// TaxOverride is a product or category taxed with another profile than the brand's default.
type TaxOverride struct {
	Kind    string `json:"kind"`
	ID      string `json:"id"`
	Profile string `json:"profile"`
}

// EtaDays is how many whole days a parcel takes after it ships.
type EtaDays struct {
	Min int `json:"min"`
	Max int `json:"max"`
}

// SellerLegal mirrors SellerLegal in packages/types: the seller's identity (PP 80/2019 Pasal 9 and
// 13), complaint service (Pasal 27) and terms choices (Pasal 53). Empty fields stay out.
type SellerLegal struct {
	EntityName         string `json:"entityName,omitempty"`
	BusinessType       string `json:"businessType,omitempty"`
	NIB                string `json:"nib,omitempty"`
	NPWP               string `json:"npwp,omitempty"`
	Address            string `json:"address,omitempty"`
	City               string `json:"city,omitempty"`
	Phone              string `json:"phone,omitempty"`
	Email              string `json:"email,omitempty"`
	Hours              string `json:"hours,omitempty"`
	ComplaintProcedure string `json:"complaintProcedure,omitempty"`
	ComplaintDays      *int   `json:"complaintDays,omitempty"`
	DisputeForum       string `json:"disputeForum,omitempty"`
	DisputeVenue       string `json:"disputeVenue,omitempty"`
	TermsExtra         string `json:"termsExtra,omitempty"`
}

// StoreMenus are the links a store shows in its header and footer, in order.
type StoreMenus struct {
	Header []MenuLink `json:"header"`
	Footer []MenuLink `json:"footer"`
}

type MenuLink struct {
	Label  string     `json:"label"`
	Target MenuTarget `json:"target"`
}

// MenuTarget is where a menu link goes. Kind is page, category, collection, catalog or url; ID names
// the page, category or collection, and URL holds a full link or a store path.
type MenuTarget struct {
	Kind string `json:"kind"`
	ID   string `json:"id,omitempty"`
	URL  string `json:"url,omitempty"`
}

type User struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Email     string   `json:"email"`
	Title     string   `json:"title"`
	Role      string   `json:"role"`
	TenantIDs []string `json:"tenantIds"`
	Color     string   `json:"color"`
	// Disabled accounts cannot sign in, and their tokens stop working at once.
	Disabled bool `json:"disabled,omitempty"`
	// Invited stays true until the person chooses a password from their invitation.
	Invited bool `json:"invited,omitempty"`
	// EmailVerifiedAt is when the person proved the inbox with a link from email.
	EmailVerifiedAt *IsoDate `json:"emailVerifiedAt,omitempty"`
}

type Seller struct {
	ID                 string   `json:"id"`
	TenantID           string   `json:"tenantId"`
	UserID             *string  `json:"userId"`
	Code               string   `json:"code"`
	Name               string   `json:"name"`
	Kind               string   `json:"kind"`
	Slug               string   `json:"slug"`
	Status             string   `json:"status"`
	City               string   `json:"city"`
	Bio                string   `json:"bio"`
	Headline           string   `json:"headline"`
	Whatsapp           string   `json:"whatsapp"`
	Instagram          *string  `json:"instagram"`
	TemplateID         string   `json:"templateId"`
	AllowedTemplateIDs []string `json:"allowedTemplateIds"`
	FeaturedProductIDs []string `json:"featuredProductIds"`
	CommissionRate     float64  `json:"commissionRate"`
	JoinedAt           IsoDate  `json:"joinedAt"`
	Color              string   `json:"color"`
	// PhotoURL is the seller's uploaded photo; empty means the storefront shows their initials.
	PhotoURL string `json:"photoUrl,omitempty"`
}

// --- storefront ---

type TemplateSection struct {
	Kind string `json:"kind"`
	Rule string `json:"rule"`
}

type Template struct {
	ID          string            `json:"id"`
	TenantID    *string           `json:"tenantId"`
	Name        string            `json:"name"`
	Scope       string            `json:"scope"`
	Description string            `json:"description"`
	BestFor     string            `json:"bestFor"`
	Sections    []TemplateSection `json:"sections"`
}

type PageSection struct {
	ID         string   `json:"id"`
	Kind       string   `json:"kind"`
	Rule       string   `json:"rule"`
	Hidden     bool     `json:"hidden"`
	Headline   string   `json:"headline"`
	Body       string   `json:"body"`
	ProductIDs []string `json:"productIds"`
	CtaLabel   string   `json:"ctaLabel"`
	// ImageURL is an uploaded image for the section; empty means the template's own photo.
	ImageURL *string `json:"imageUrl,omitempty"`
	// CtaHref is where the section's button goes: a store path ("/p/prd-1") or a full https link.
	CtaHref *string `json:"ctaHref,omitempty"`
	// Items are FAQ questions with answers, or testimonial quotes with their author.
	Items []PageSectionItem `json:"items,omitempty"`
	// Order is the position on the page once it is arranged by hand; without it the template order applies.
	Order *int `json:"order,omitempty"`
}

type PageSectionItem struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

type PageRevision struct {
	ID         string        `json:"id"`
	At         IsoDate       `json:"at"`
	By         string        `json:"by"`
	Note       string        `json:"note"`
	Sections   []PageSection `json:"sections"`
	TemplateID string        `json:"templateId"`
}

type PageSeo struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

type Page struct {
	ID          string         `json:"id"`
	TenantID    string         `json:"tenantId"`
	Title       string         `json:"title"`
	Slug        string         `json:"slug"`
	Kind        string         `json:"kind"`
	TemplateID  string         `json:"templateId"`
	SellerID    *string        `json:"sellerId"`
	Status      string         `json:"status"`
	Sections    []PageSection  `json:"sections"`
	Seo         PageSeo        `json:"seo"`
	UpdatedAt   IsoDate        `json:"updatedAt"`
	UpdatedBy   string         `json:"updatedBy"`
	PublishedAt *IsoDate       `json:"publishedAt"`
	ScheduledAt *IsoDate       `json:"scheduledAt"`
	Revisions   []PageRevision `json:"revisions"`
	Views30d    int            `json:"views30d"`
}

// PageDraft holds a live page's unpublished changes, one row per page (ID is the page's id).
// Publishing copies them into the page. Staff see drafts; the storefront never receives them.
type PageDraft struct {
	ID         string        `json:"id"`
	TenantID   string        `json:"tenantId"`
	Sections   []PageSection `json:"sections"`
	Seo        PageSeo       `json:"seo"`
	TemplateID string        `json:"templateId"`
	UpdatedAt  IsoDate       `json:"updatedAt"`
	UpdatedBy  string        `json:"updatedBy"`
}

// --- catalog and stock ---

type Category struct {
	ID          string  `json:"id"`
	TenantID    string  `json:"tenantId"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	ParentID    *string `json:"parentId"`
}

type AttributeDef struct {
	ID          string   `json:"id"`
	TenantID    string   `json:"tenantId"`
	Name        string   `json:"name"`
	Code        string   `json:"code"`
	Type        string   `json:"type"`
	Unit        *string  `json:"unit"`
	Options     []string `json:"options"`
	Filterable  bool     `json:"filterable"`
	Required    bool     `json:"required"`
	CategoryIDs []string `json:"categoryIds"`
}

type ModifierOption struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	PriceDelta   int    `json:"priceDelta"`
	StockTracked *bool  `json:"stockTracked,omitempty"`
}

// Tracked reports whether the option keeps its own stock.
func (o ModifierOption) Tracked() bool { return o.StockTracked != nil && *o.StockTracked }

type ModifierGroup struct {
	ID         string           `json:"id"`
	TenantID   string           `json:"tenantId"`
	Name       string           `json:"name"`
	Selection  string           `json:"selection"`
	Required   bool             `json:"required"`
	MaxChoices int              `json:"maxChoices"`
	Options    []ModifierOption `json:"options"`
	ProductIDs []string         `json:"productIds"`
}

type Collection struct {
	ID              string   `json:"id"`
	TenantID        string   `json:"tenantId"`
	Name            string   `json:"name"`
	Slug            string   `json:"slug"`
	Description     string   `json:"description"`
	Mode            string   `json:"mode"`
	ProductIDs      []string `json:"productIds"`
	RuleCategoryIDs []string `json:"ruleCategoryIds"`
	RuleTags        []string `json:"ruleTags"`
	Featured        bool     `json:"featured"`
}

type ProductOption struct {
	Name   string   `json:"name"`
	Values []string `json:"values"`
}

type Variant struct {
	ID           string            `json:"id"`
	Sku          string            `json:"sku"`
	Name         string            `json:"name"`
	OptionValues map[string]string `json:"optionValues"`
	Price        int               `json:"price"`
	Barcode      string            `json:"barcode"`
}

type Product struct {
	ID          string            `json:"id"`
	TenantID    string            `json:"tenantId"`
	Code        string            `json:"code"`
	Name        string            `json:"name"`
	CategoryID  string            `json:"categoryId"`
	Type        string            `json:"type"`
	Status      string            `json:"status"`
	Price       int               `json:"price"`
	CompareAt   *int              `json:"compareAt"`
	MemberPrice *int              `json:"memberPrice"`
	Cost        int               `json:"cost"`
	Tags        []string          `json:"tags"`
	Options     []ProductOption   `json:"options"`
	Attributes  map[string]string `json:"attributes"`
	Description string            `json:"description"`
	BestFor     string            `json:"bestFor"`
	Variants    []Variant         `json:"variants"`
	Rating      float64           `json:"rating"`
	ReviewCount int               `json:"reviewCount"`
	Views30d    int               `json:"views30d"`
	Assisted    bool              `json:"assisted"`
	CreatedAt   IsoDate           `json:"createdAt"`
	PublishAt   *IsoDate          `json:"publishAt"`
	// ImageURL is an uploaded photo; empty means the storefront's stock photo.
	ImageURL *string `json:"imageUrl,omitempty"`
	// WeightGrams is the shipping weight, set from the product CSV import.
	WeightGrams *int `json:"weightGrams,omitempty"`
}

type Warehouse struct {
	ID       string `json:"id"`
	TenantID string `json:"tenantId"`
	Code     string `json:"code"`
	Name     string `json:"name"`
	City     string `json:"city"`
}

type StockLevel struct {
	ID          string `json:"id"`
	TenantID    string `json:"tenantId"`
	VariantID   string `json:"variantId"`
	ProductID   string `json:"productId"`
	WarehouseID string `json:"warehouseId"`
	OnHand      int    `json:"onHand"`
	Reserved    int    `json:"reserved"`
	Safety      int    `json:"safety"`
}

type StockMove struct {
	ID          string  `json:"id"`
	TenantID    string  `json:"tenantId"`
	VariantID   string  `json:"variantId"`
	WarehouseID string  `json:"warehouseId"`
	Kind        string  `json:"kind"`
	Qty         int     `json:"qty"`
	At          IsoDate `json:"at"`
	By          string  `json:"by"`
	Note        string  `json:"note"`
}

type ModifierStockLevel struct {
	ID          string `json:"id"`
	TenantID    string `json:"tenantId"`
	GroupID     string `json:"groupId"`
	OptionID    string `json:"optionId"`
	WarehouseID string `json:"warehouseId"`
	OnHand      int    `json:"onHand"`
	Reserved    int    `json:"reserved"`
	Safety      int    `json:"safety"`
}

type ModifierStockMove struct {
	ID          string  `json:"id"`
	TenantID    string  `json:"tenantId"`
	GroupID     string  `json:"groupId"`
	OptionID    string  `json:"optionId"`
	WarehouseID string  `json:"warehouseId"`
	Kind        string  `json:"kind"`
	Qty         int     `json:"qty"`
	At          IsoDate `json:"at"`
	By          string  `json:"by"`
	Note        string  `json:"note"`
}

// --- orders ---

type OrderLineModifier struct {
	GroupID    string `json:"groupId"`
	OptionID   string `json:"optionId"`
	Name       string `json:"name"`
	PriceDelta int    `json:"priceDelta"`
}

type OrderLine struct {
	ProductID string              `json:"productId"`
	VariantID string              `json:"variantId"`
	Qty       int                 `json:"qty"`
	Price     int                 `json:"price"`
	Modifiers []OrderLineModifier `json:"modifiers,omitzero"`
}

type OrderEvent struct {
	ID     string  `json:"id"`
	At     IsoDate `json:"at"`
	By     string  `json:"by"`
	Status *string `json:"status"`
	Note   string  `json:"note"`
}

type DiscountLine struct {
	PromotionID string `json:"promotionId"`
	Label       string `json:"label"`
	Amount      int    `json:"amount"`
}

type AgentOrderInfo struct {
	Kind             string `json:"kind"`
	Intent           string `json:"intent"`
	IntentMandateID  string `json:"intentMandateId"`
	CartMandateID    string `json:"cartMandateId"`
	PaymentMandateID string `json:"paymentMandateId"`
	Negotiated       int    `json:"negotiated"`
	Compared         int    `json:"compared"`
}

type Order struct {
	ID             string          `json:"id"`
	TenantID       string          `json:"tenantId"`
	Code           string          `json:"code"`
	CustomerID     string          `json:"customerId"`
	Channel        string          `json:"channel"`
	SellerID       *string         `json:"sellerId"`
	CampaignID     *string         `json:"campaignId"`
	Status         string          `json:"status"`
	PaymentStatus  string          `json:"paymentStatus"`
	PaymentMethod  string          `json:"paymentMethod"`
	Courier        string          `json:"courier"`
	TrackingNo     *string         `json:"trackingNo"`
	WarehouseID    string          `json:"warehouseId"`
	City           string          `json:"city"`
	Lines          []OrderLine     `json:"lines"`
	Subtotal       int             `json:"subtotal"`
	Discount       int             `json:"discount"`
	Shipping       int             `json:"shipping"`
	Total          int             `json:"total"`
	VoucherCode    *string         `json:"voucherCode"`
	PaymentTypeID  *string         `json:"paymentTypeId,omitempty"`
	DiscountLines  []DiscountLine  `json:"discountLines,omitzero"`
	PointsEarned   int             `json:"pointsEarned"`
	CreatedAt      IsoDate         `json:"createdAt"`
	CancelReason   *string         `json:"cancelReason"`
	RefundedAmount int             `json:"refundedAmount"`
	Events         []OrderEvent    `json:"events"`
	Agent          *AgentOrderInfo `json:"agent,omitempty"`
	// TermsVersion is the version of the store's terms the shopper agreed to at checkout, and
	// TermsAcceptedAt when, by the API's clock.
	TermsVersion    string  `json:"termsVersion,omitempty"`
	TermsAcceptedAt IsoDate `json:"termsAcceptedAt,omitempty"`
	// PaymentConfirmation is the shopper's word that they paid by manual transfer or static QRIS.
	PaymentConfirmation *PaymentConfirmation `json:"paymentConfirmation,omitempty"`
	// CancelRefund is the money a cancellation owes the shopper and how it went back.
	CancelRefund *CancelRefund `json:"cancelRefund,omitempty"`
	// Tax is the order's PPN with the rates of the day; only orders of a PKP brand carry it.
	Tax *OrderTax `json:"tax,omitempty"`
}

// OrderTax mirrors OrderTax in packages/types. Lines follow the order's lines.
type OrderTax struct {
	PricesIncludeTax bool           `json:"pricesIncludeTax"`
	RatePct          float64        `json:"ratePct"`
	DppNumerator     int            `json:"dppNumerator"`
	DppDenominator   int            `json:"dppDenominator"`
	Lines            []OrderTaxLine `json:"lines"`
	DPP              int            `json:"dpp"`
	PPN              int            `json:"ppn"`
}

// OrderTaxLine is one line's share: Net excludes PPN, and Net + PPN is what the line costs.
type OrderTaxLine struct {
	Profile string `json:"profile"`
	Net     int    `json:"net"`
	DPP     int    `json:"dpp"`
	PPN     int    `json:"ppn"`
}

type AgentPolicy struct {
	TenantID           string   `json:"tenantId"`
	Enabled            bool     `json:"enabled"`
	Negotiation        bool     `json:"negotiation"`
	MaxAutoDiscountPct int      `json:"maxAutoDiscountPct"`
	PaymentTypeIDs     []string `json:"paymentTypeIds"`
	Kinds              []string `json:"kinds"`
	UpdatedAt          IsoDate  `json:"updatedAt"`
}

// --- customers and CRM ---

type Customer struct {
	ID        string   `json:"id"`
	TenantID  string   `json:"tenantId"`
	Code      string   `json:"code"`
	Name      string   `json:"name"`
	Email     string   `json:"email"`
	Phone     string   `json:"phone"`
	City      string   `json:"city"`
	Source    string   `json:"source"`
	Stage     string   `json:"stage"`
	Tier      string   `json:"tier"`
	Points    int      `json:"points"`
	Tags      []string `json:"tags"`
	Interests []string `json:"interests"`
	SellerID  *string  `json:"sellerId"`
	CreatedAt IsoDate  `json:"createdAt"`
	Birthday  *string  `json:"birthday"`
	Color     string   `json:"color"`
	// MarketingConsent is the shopper's last answer about offers and news; nil means never asked.
	MarketingConsent *MarketingConsent `json:"marketingConsent,omitempty"`
	// ErasedAt is when the customer's personal data was replaced with placeholders.
	ErasedAt IsoDate `json:"erasedAt,omitempty"`
}

// MarketingConsent records whether a shopper agreed to marketing messages, when, where they
// answered and which wording they saw, as proof of consent.
type MarketingConsent struct {
	Granted     bool    `json:"granted"`
	At          IsoDate `json:"at"`
	Source      string  `json:"source"`
	TextVersion string  `json:"textVersion"`
}

type CustomerEvent struct {
	ID         string  `json:"id"`
	TenantID   string  `json:"tenantId"`
	CustomerID string  `json:"customerId"`
	Kind       string  `json:"kind"`
	At         IsoDate `json:"at"`
	Label      string  `json:"label"`
	ProductID  *string `json:"productId"`
	OrderID    *string `json:"orderId"`
	CampaignID *string `json:"campaignId"`
	By         *string `json:"by"`
}

type SegmentRule struct {
	Field string `json:"field"`
	Op    string `json:"op"`
	Value string `json:"value"`
}

type Segment struct {
	ID          string        `json:"id"`
	TenantID    string        `json:"tenantId"`
	Name        string        `json:"name"`
	Description string        `json:"description"`
	BuiltIn     bool          `json:"builtIn"`
	Match       string        `json:"match"`
	Rules       []SegmentRule `json:"rules"`
	CreatedAt   IsoDate       `json:"createdAt"`
}

type Lead struct {
	ID         string  `json:"id"`
	TenantID   string  `json:"tenantId"`
	Code       string  `json:"code"`
	Name       string  `json:"name"`
	Company    string  `json:"company"`
	Phone      string  `json:"phone"`
	ProductID  *string `json:"productId"`
	Value      int     `json:"value"`
	Stage      string  `json:"stage"`
	Source     string  `json:"source"`
	SellerID   *string `json:"sellerId"`
	CustomerID *string `json:"customerId"`
	Note       string  `json:"note"`
	CreatedAt  IsoDate `json:"createdAt"`
	UpdatedAt  IsoDate `json:"updatedAt"`
	LostReason *string `json:"lostReason"`
}

type Ticket struct {
	ID         string   `json:"id"`
	TenantID   string   `json:"tenantId"`
	Code       string   `json:"code"`
	CustomerID string   `json:"customerId"`
	OrderID    *string  `json:"orderId"`
	Kind       string   `json:"kind"`
	Status     string   `json:"status"`
	Subject    string   `json:"subject"`
	Channel    string   `json:"channel"`
	AssigneeID *string  `json:"assigneeId"`
	CreatedAt  IsoDate  `json:"createdAt"`
	SlaDueAt   IsoDate  `json:"slaDueAt"`
	ResolvedAt *IsoDate `json:"resolvedAt"`
	// Message is what the shopper wrote in the storefront's complaint form.
	Message string `json:"message,omitempty"`
	// Contact is how to reach the shopper; a guest's ticket has no customer record.
	Contact *TicketContact `json:"contact,omitempty"`
}

type TicketContact struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Phone string `json:"phone"`
}

// --- growth ---

type Campaign struct {
	ID          string         `json:"id"`
	TenantID    string         `json:"tenantId"`
	Code        string         `json:"code"`
	Name        string         `json:"name"`
	Goal        string         `json:"goal"`
	Status      string         `json:"status"`
	Channels    []string       `json:"channels"`
	SegmentID   *string        `json:"segmentId"`
	PromotionID *string        `json:"promotionId"`
	PageID      *string        `json:"pageId"`
	StartAt     IsoDate        `json:"startAt"`
	EndAt       IsoDate        `json:"endAt"`
	Budget      int            `json:"budget"`
	Funnel      map[string]int `json:"funnel"`
	Revenue     int            `json:"revenue"`
	CreatedBy   string         `json:"createdBy"`
}

type AutomationStep struct {
	ID     string `json:"id"`
	Kind   string `json:"kind"`
	Detail string `json:"detail"`
}

type Automation struct {
	ID            string           `json:"id"`
	TenantID      string           `json:"tenantId"`
	Name          string           `json:"name"`
	Description   string           `json:"description"`
	Status        string           `json:"status"`
	Trigger       string           `json:"trigger"`
	TriggerDetail string           `json:"triggerDetail"`
	Steps         []AutomationStep `json:"steps"`
	Enrolled30d   int              `json:"enrolled30d"`
	Converted30d  int              `json:"converted30d"`
	Revenue30d    int              `json:"revenue30d"`
	UpdatedAt     IsoDate          `json:"updatedAt"`
}

type Promotion struct {
	ID             string   `json:"id"`
	TenantID       string   `json:"tenantId"`
	Code           string   `json:"code"`
	Name           string   `json:"name"`
	Kind           string   `json:"kind"`
	Trigger        string   `json:"trigger"`
	Value          int      `json:"value"`
	MaxDiscount    *int     `json:"maxDiscount"`
	BuyQty         *int     `json:"buyQty"`
	GetQty         *int     `json:"getQty"`
	GetDiscountPct *int     `json:"getDiscountPct"`
	MinSpend       int      `json:"minSpend"`
	SegmentID      *string  `json:"segmentId"`
	CategoryIDs    []string `json:"categoryIds"`
	ProductIDs     []string `json:"productIds"`
	PaymentTypeIDs []string `json:"paymentTypeIds"`
	Status         string   `json:"status"`
	StartAt        IsoDate  `json:"startAt"`
	EndAt          IsoDate  `json:"endAt"`
	UsageLimit     *int     `json:"usageLimit"`
	Used           int      `json:"used"`
	Revenue        int      `json:"revenue"`
	SellerID       *string  `json:"sellerId"`
}

// --- platform ---

type PaymentType struct {
	ID           string  `json:"id"`
	TenantID     string  `json:"tenantId"`
	Name         string  `json:"name"`
	Method       string  `json:"method"`
	Provider     string  `json:"provider"`
	Enabled      bool    `json:"enabled"`
	FeePercent   float64 `json:"feePercent"`
	FeeFixed     int     `json:"feeFixed"`
	MinAmount    int     `json:"minAmount"`
	MaxAmount    *int    `json:"maxAmount"`
	Instructions string  `json:"instructions"`
	Sort         int     `json:"sort"`
}

type Integration struct {
	ID         string   `json:"id"`
	TenantID   string   `json:"tenantId"`
	Provider   string   `json:"provider"`
	Category   string   `json:"category"`
	Health     string   `json:"health"`
	Enabled    bool     `json:"enabled"`
	Endpoint   string   `json:"endpoint"`
	LastSyncAt *IsoDate `json:"lastSyncAt"`
	Events24h  int      `json:"events24h"`
	Errors24h  int      `json:"errors24h"`
	Note       string   `json:"note"`
}

type IntegrationLog struct {
	ID            string  `json:"id"`
	TenantID      string  `json:"tenantId"`
	IntegrationID string  `json:"integrationId"`
	At            IsoDate `json:"at"`
	Direction     string  `json:"direction"`
	Event         string  `json:"event"`
	Path          string  `json:"path"`
	Ok            bool    `json:"ok"`
	Ms            int     `json:"ms"`
	Summary       string  `json:"summary"`
}

type TrafficDay struct {
	ID          string  `json:"id"`
	TenantID    string  `json:"tenantId"`
	SellerID    *string `json:"sellerId"`
	Day         string  `json:"day"`
	Visitors    int     `json:"visitors"`
	PageViews   int     `json:"pageViews"`
	Carts       int     `json:"carts"`
	Checkouts   int     `json:"checkouts"`
	AgentVisits *int    `json:"agentVisits,omitempty"`
}

type SearchTerm struct {
	ID       string `json:"id"`
	TenantID string `json:"tenantId"`
	Term     string `json:"term"`
	Count30d int    `json:"count30d"`
	Results  int    `json:"results"`
	// Days counts searches per WIB day (YYYY-MM-DD) over the last 30; Count30d is their sum.
	Days map[string]int `json:"days,omitempty"`
	// LastSearchedAt is when a shopper last searched the term.
	LastSearchedAt string `json:"lastSearchedAt,omitempty"`
}

// AppState is the whole dataset as the apps hold it; the API serves it scoped to the caller.
type AppState struct {
	Tenants            []Tenant             `json:"tenants"`
	Users              []User               `json:"users"`
	Sellers            []Seller             `json:"sellers"`
	Templates          []Template           `json:"templates"`
	Pages              []Page               `json:"pages"`
	PageDrafts         []PageDraft          `json:"pageDrafts"`
	Categories         []Category           `json:"categories"`
	Attributes         []AttributeDef       `json:"attributes"`
	Modifiers          []ModifierGroup      `json:"modifiers"`
	Collections        []Collection         `json:"collections"`
	Products           []Product            `json:"products"`
	Warehouses         []Warehouse          `json:"warehouses"`
	Stock              []StockLevel         `json:"stock"`
	StockMoves         []StockMove          `json:"stockMoves"`
	ModifierStock      []ModifierStockLevel `json:"modifierStock"`
	ModifierStockMoves []ModifierStockMove  `json:"modifierStockMoves"`
	Customers          []Customer           `json:"customers"`
	CustomerEvents     []CustomerEvent      `json:"customerEvents"`
	Orders             []Order              `json:"orders"`
	Segments           []Segment            `json:"segments"`
	Leads              []Lead               `json:"leads"`
	Tickets            []Ticket             `json:"tickets"`
	Campaigns          []Campaign           `json:"campaigns"`
	Automations        []Automation         `json:"automations"`
	Promotions         []Promotion          `json:"promotions"`
	PaymentTypes       []PaymentType        `json:"paymentTypes"`
	AgentPolicies      []AgentPolicy        `json:"agentPolicies"`
	Integrations       []Integration        `json:"integrations"`
	IntegrationLogs    []IntegrationLog     `json:"integrationLogs"`
	Traffic            []TrafficDay         `json:"traffic"`
	SearchTerms        []SearchTerm         `json:"searchTerms"`
}

type ReturnItem struct {
	ProductID string `json:"productId"`
	VariantID string `json:"variantId"`
	Qty       int    `json:"qty"`
	Reason    string `json:"reason"`
}

type ReturnEvent struct {
	ID     string  `json:"id"`
	At     IsoDate `json:"at"`
	By     string  `json:"by"`
	Status *string `json:"status"`
	Note   string  `json:"note"`
}

// OrderReturn is a request to send bought items back for a refund.
type OrderReturn struct {
	ID           string        `json:"id"`
	TenantID     string        `json:"tenantId"`
	Code         string        `json:"code"`
	OrderID      string        `json:"orderId"`
	CustomerID   string        `json:"customerId"`
	Items        []ReturnItem  `json:"items"`
	Reason       string        `json:"reason"`
	Note         string        `json:"note"`
	Status       string        `json:"status"`
	RequestedBy  string        `json:"requestedBy"`
	RefundAmount int           `json:"refundAmount"`
	Restock      bool          `json:"restock"`
	RejectReason string        `json:"rejectReason,omitempty"`
	Events       []ReturnEvent `json:"events"`
	CreatedAt    IsoDate       `json:"createdAt"`

	// ShippingPaidBy is brand or shopper, fixed when the return was requested.
	ShippingPaidBy string `json:"shippingPaidBy,omitempty"`
	// RefundShipping is the return shipping the brand added to the refund; part of RefundAmount.
	RefundShipping  int    `json:"refundShipping,omitempty"`
	RefundMethod    string `json:"refundMethod,omitempty"`
	RefundReference string `json:"refundReference,omitempty"`
	RefundedOn      string `json:"refundedOn,omitempty"`
	// GatewayStatus is the last gateway refund attempt: succeeded, failed or pending (no answer).
	GatewayStatus string `json:"gatewayStatus,omitempty"`
	GatewayError  string `json:"gatewayError,omitempty"`
}
