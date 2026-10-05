# Frontend conventions (Commerce OS)

The day-to-day summary of the WIT house style (`~/.claude/skills/wit-code-agent`) for this repo. Read it before adding a page.

## Workspace

| Package | Holds | Imports |
|---|---|---|
| `packages/types` (`@rc/types`) | domain unions with `*_LABEL` and `*_FLOW` maps (`enums.ts`), entities (`entities.ts`) | nothing |
| `packages/fixtures` (`@rc/fixtures`) | seed loader, the reducer store, blockers (`rules.ts`), permissions, derivations (`derive.ts`), analytics, notifications, format and date helpers | types |
| `packages/ui` (`@rc/ui`) | the component kit and SVG charts | nothing domain |
| `packages/tailwind-config` | `theme.css`, the tokens | |
| `apps/admin` | desktop-first console | all of the above |
| `apps/mobile` | phone PWA for sales agents | all of the above |
| `scripts/` | the seeded generator, `pnpm gen:fixtures` | types, fixtures helpers |

Dependencies point down. A page composes; it owns no business rules.

## Data and state

- `useScoped()` (`apps/admin/src/state/scoped.ts`) returns the signed-in tenant's collections (`orders`, `customers`, `products`, `stock`, `segments`, `leads`, `campaigns`, …), `maps.<entity>` by id, `crm` (customer metrics and cart state that segment rules read), `stockByProduct`, name helpers (`userName`, `customerName`, `productName`, `categoryName`, `sellerName`, `segmentName`) and `dispatch`. Never filter `state` by tenant in a page.
- Mutations go through `dispatch({ type: 'entity/verb', … })`. The action list lives in `packages/fixtures/src/store.ts`. The scoped dispatch stamps the user and the app clock.
- Blockers in `packages/fixtures/src/rules.ts` (`orderAdvanceBlocker`, `orderCancelBlocker`, `orderRefundBlocker`, `productActivateBlocker`, `pagePublishBlocker`, `campaignLaunchBlocker`, `leadMoveBlocker`, `sellerTemplateBlocker`, `stockAdjustBlocker`, `segmentRemoveBlocker`). The reducer refuses with the same check; the UI shows the same sentence beside the disabled button or in a danger toast.
- Permissions: `useAuth().can('order.fulfil')`. Hide what a role cannot do. Disable only for a state reason, and say why.
- Derivations: `packages/fixtures/src/derive.ts` (stock, order flow, customer metrics, tiers, segment rules) and `analytics.ts` (daily and monthly revenue, period KPIs, cohorts, channel mix, seller and product performance). Page-only derivations go in the feature's `lib.ts`.
- Dates and numbers: `fmtDate`, `fmtDateTime`, `fmtWhen`, `fmtAgo`, `fmtIdr`, `fmtIdrShort`, `fmtNumber`, `fmtPercent`, `plural`, `toMs`, `nowMs`, `DAY`. JSX never calls `toLocaleString`.
- The app clock starts at `FIXTURE_NOW` (Monday 5 October 2026, 09:41 WIB) and ticks. `useNow()` re-renders "x ago" labels.
- `system/tick` runs every minute: unpaid orders cancel after 24 hours, promotions, campaigns and scheduled pages start and end on time.

## Routes and shared components

- Every record has its own route, built through `paths.*` in `components/links.tsx`. `new` as the id creates (`/commerce/products/new`, `/customers/segments/new`). Lists that open a create dialog read `?new=1` and drop it once the dialog closes.
- Links: `CustomerLink`, `OrderLink`, `ProductLink`, `SellerChip`, `PersonChip`.
- Badges: one per status union in `components/badges.tsx` (`OrderStatusBadge`, `PaymentBadge`, `ProductStatusBadge`, `StockBadge`, `LifecycleBadge`, `TierBadge`, `LeadStageBadge`, `TicketStatusBadge`, `CampaignStatusBadge`, `AutomationStatusBadge`, `PromotionStatusBadge`, `PageStatusBadge`, `SellerStatusBadge`, `HealthBadge`, `ChannelBadge`). On an ink surface pass `className={ON_INK}` to a badge that supports it, or render `bg-white/10 text-white` badges.
- Pickers in `components/pickers.tsx`: every data-backed dropdown is a searchable combobox (`CustomerPicker`, `ProductPicker`, `ProductsPicker`, `VariantPicker`, `CategoryPicker`, `WarehousePicker`, `SellerPicker`, `SegmentPicker`, `UserPicker`, `TemplatePicker`, `PromotionPicker`, `PagePicker`). `NativeSelect` only for fixed enums of six or fewer.
- `BackButton fallback={listPath}` on every detail page. `HeroMetric` (`components/HeroMetric.tsx`) renders each number on an ink hero.
- `StorefrontPreview` (`components/StorefrontPreview.tsx`) renders page content through a template with the tenant's brand tokens. Tenant colours reach it as data through inline CSS variables.
- List state: `useHistoryState(name, initial)` for search and filters, `{...useTableHistory()}` on `DataTable`. Filters other pages link to live in the URL (`?view=`, `?tab=`), set with `replace: true`.

## Navigation map

`layouts/nav.ts` is the one source for the rail, the section tabs, the phone bar and the More sheet. Sections sit in four groups, in the order a brand team works:

| Group | Sections |
|---|---|
| Daily work | Home, Orders, Customers (All customers, Support, Segments, Loyalty) |
| Sell | Catalog (Products, Categories, Attributes, Modifiers, Inventory), Online store (Pages, Templates, Brand guideline, Domains & SEO) |
| Grow | Marketing (Campaigns, Promotions, Automations), Sales network (Leads, Sellers, Performance) |
| Insights & setup | Analytics, Integrations, Settings |

`sectionFor()` matches by the longest URL prefix, so a section may hold pages from any route folder (Leads lives at `/customers/leads` but belongs to Sales network). Add a page by adding a leaf; never derive sections from the first path segment.

## Page forms

- **List page** (this product's one list form, as in MES): `PageHeader` (one-sentence purpose, pill search, primary) → clickable `StatCard` tiles that apply filters → `ChipRow` of `Chip variant="filter"` with counts → `DataTable` on the canvas, no card. Reference: `pages/orders/OrdersPage.tsx`.
- **Detail page**: action bar (BackButton left; the next lifecycle step as primary, outline secondaries, an outline `MoreHorizontal` ActionMenu) → blocker note card → ink hero card (mono code, title, badges, metric grid) → `Steps` card → KeyValue cards in `lg:grid-cols-2` → related cards → history → dialogs. Reference: `pages/orders/OrderDetailPage.tsx`.
- **Gallery page** (templates, sellers): PageHeader, StatCards as filters, ChipRow, `grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3` of stretched-link cards.
- **Analytics**: PageHeader with a `PillTabs size="sm"` window, KPI tiles, one chart per card, BarList rankings.
- Section tables on any other page sit in a `Card` under a `CardHeader`.

## Rules that break layouts

- Every breakpoint-only grid has a `grid-cols-1` base; `fr` tracks holding truncating text are `minmax(0, …)`.
- Rows with a trailing button are `flex flex-wrap items-center justify-between gap-2`.
- No negative-margin bleed inside the admin `main`. ChipRow, PillTabs and Steps scroll inside their own box.
- One `h1` per page (PageHeader renders it; the dashboard has an `sr-only` one). Card titles are one level below.
- Check at 375 and 768 wide: `main.scrollWidth === main.clientWidth`.

## Style

- One accent per region; the second emphasis is ink. Solid accent behind small white text is `accent-strong` (`Button` primary, `Badge variant="accent"`).
- No hex or rgb in class strings or components. Tenant storefront colours are data (`tenant.brand.colors`) and may go into inline `style` for previews only.
- Icons: lucide-react, `size-4` in controls and `size-5` in tiles.
- Copy: English, plain and specific. Errors are full-sentence instructions. No em dashes, no exclamation marks. Toast every mutation in the past tense with the record in the description.

## Storefront pages

Brand teams and sellers pick one of the existing templates; there is no section editor. `pages/setTemplate` and `sellers/setTemplate` rebuild a page's sections from the chosen template and carry headline, text, products and buttons over by section kind (`applyTemplate` in `store.ts`). Each revision stores its template, so a rollback restores both.

## Pricing and variants

`packages/fixtures/src/pricing.ts` is the one pricing engine. `priceCart()` applies every open automatic promotion plus the typed code, each scoped by categories (sub-categories included), products and payment types, and returns the discount lines the order stores. Kinds: percentage (with an optional cap), nominal, buy X get Y, free shipping and bundle price. The storefront prices carts with it and the admin previews offers with it; never compute a discount anywhere else.

Payment types are master data (`state.paymentTypes`): checkout lists `availablePaymentTypes()` and promotions can require one. Products carry `options` (Size, Colour); each combination is a variant with `optionValues`, built with `optionCombinations()`.

## Storefront look

- Photos: `packages/fixtures/src/photos.ts` maps product, category and tenant ids to Unsplash photo ids (free licence, hotlinked from images.unsplash.com). `photoUrl(id, width, ratio)` adds the crop. The storefront renders them through `Photo` and `ProductImage` in `components/product.tsx`; a product without a photo falls back to the tinted initials block. Real product media replaces this map once the API serves it.
- Logos: `components/BrandLogo.tsx` draws each demo brand's mark as SVG on the tenant tokens (`BrandMark`, `BrandLogo`, `inverse` for a primary-coloured bar). A tenant without a drawn mark gets its initial on a primary tile.
- Ornaments: `components/ornaments.tsx` holds the hand-drawn underline (`Underlined` puts it under a headline's last word), `Sparkle`, the round `Stamp` and the tilted `Sticker`. Use one or two per screen region.
- The canvas carries a faint paper grain (`index.css`), and both themes use a floating sticky navbar. Sticky side panels sit below it with `top-[var(--sf-sticky-top)]`.
- Tenant palettes stay muted: a deep primary, a dark secondary, a sand or brass accent, a warm off-white background.
- Proportions: every product grid and rail uses `PRODUCT_GRID` / `PRODUCT_RAIL` from `components/sections.tsx` (2 columns on phones, 3 at md, 4 at lg, 5 at xl, 6 at 2xl), so a product card has one size everywhere. Rails scroll below lg and show a single row above it. Product photos are 4:5 in cards and in the product gallery (capped to the viewport height on desktop).
- Type scale: `sf-hero-title`, `sf-title`, `sf-kicker`, `sf-lede` and `sf-price` in `index.css`. Promotions render through `components/promo.tsx` (`Ticket`, `PromoValue`, `CouponCode`, `CodeOfferStrip`).
- Admin previews: `apps/admin/src/components/LiveStorefront.tsx` frames the real storefront (`?embed=1`) and posts the console state, plus any unsaved brand or page, with `postMessage` to `STOREFRONT_ORIGIN`. The storefront accepts it only from `VITE_ADMIN_ORIGINS` (default the admin dev and preview ports), overlays it in memory (`state/store.tsx`, `lib/embed.ts`), hides the demo bar and assistant, and shows a draft with `?page=<id>`; pages other than home and personal stores render at `/:store/preview/:pageId`. When the storefront does not answer within 6 seconds, the admin falls back to `StorefrontPreview`. Onboarding keeps `StorefrontPreview` because its tenant does not exist yet.

## Admin density

- From lg (1024px) the admin sets `html { font-size: 13px }` (`apps/admin/src/index.css`), so every rem-based size (type, spacing, cards, controls, the 15rem rail) renders at about 81 percent. Breakpoints still use the browser's 16px. Phones and tablets keep 16px.
- Write custom sizes in rem (`text-[0.6875rem]`, not `text-[11px]`) so they follow the density. Keep px only for real device frames such as a 375px phone preview.
- The rail opens from lg and remembers the choice; section pill tabs show only while it is collapsed.
