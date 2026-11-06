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

## Backend API (`apps/api`, Go)

- The API is the system of record when an app is built with `VITE_API_URL`; otherwise the app runs on the bundled seed and the local reducer, as before. Each app's `lib/api.ts` holds the switch (`HTTP`), the client and the token store; `AppStateProvider` picks `ApiStateProvider` or `LocalStateProvider`. Pages do not know which one is running: `useScoped()`, `dispatch` and `send` keep their signatures.
- One request per action: `actionRequest()` in `packages/api` maps every `entity/verb` to its method and path (`orders/advance` → `POST /api/v1/orders/{id}/advance`). The answer is a `Delta` (`upserts` and `removes` per collection), which `applyDelta()` lays over the state; the same delta reaches every other client through `GET /api/v1/events` (server-sent events), so the console, the seller app and the storefront see each other's changes.
- Rules live once more in Go: `internal/rules` ports `rules.ts`, `derive.ts` and `pricing.ts` word for word, and `internal/service` ports every reducer case as one transaction. A refusal returns `409` with the sentence the UI shows; the apps toast it. `scripts/api-golden.ts` records the reducer's deltas and `internal/service/parity_test.go` proves the Go service writes the same rows. When a rule changes, change it in both places and regenerate the golden file.
- Storage: one Postgres table per collection, each row the entity as a JSON document plus generated columns for filters (`tenant_id`, `status`, `code`). Nested aggregates (variants, order lines, page sections) stay inside the document. Stock rows lock (`for update`) inside the transaction that changes them.
- Auth: `POST /api/v1/auth/login` returns a bearer token (HS256, 12 hours) carrying the role and tenant ids; every handler checks the role's permission (the same table as `permissions.ts`) and the service checks the row's tenant. Storefront shoppers get a customer token per store (`/shop/{store}/sign-in` in demo mode, or with the receipt of a guest checkout); the public `/shop/{store}/state` carries no customers or orders.
- The server runs `system/tick` every minute and stamps `at` and `by` itself; apps in API mode skip the local tick and take the clock from the server (`syncClock`).
- `GET /api/v1/routes` lists every endpoint with its action and permission; `GET /api/v1/health` reports the database and the open streams.
- OpenAPI: `internal/httpapi/openapi.go` builds the document from the route table and the Go types (`routeDocs` adds bodies). A new write needs a `routeDocs` entry, or `openapi_test.go` fails; then run `pnpm gen:openapi`.
- API keys: a console permission maps to a scope in `auth.ScopeFor`. A permission without a scope (`tenant.manage`, `integration.manage`) stays with people, so a key can never manage keys. `store.Put` refuses to change a row's tenant, so a save cannot take another tenant's record.
- Webhooks: `tx.enqueue` writes deliveries in the action's own transaction, from the rows it wrote (`rowEvents`) and `t.emit` for what a row cannot say (`order.paid`). A timer sends them through `OutboundClient`, which refuses internal IPs at connect time. A new event goes in `WebhookEvents`.
- AI: `POST /shop/{store}/ai/chat` asks the model what a message means. `checkAIAnswer` keeps only known actions and real ids, and `aiActions` must never hold one that pays: approval stays an exact "ya" or the button. Customer records never go in the prompt.
- Sign-in: `POST /auth/login` for staff and `POST /shop/{store}/login` or `/register` for shoppers, capped per client and per email. A guest may only name a new customer id when ordering, since the receipt carries a token for it. Registering never attaches a guest's earlier orders, because no email check proves the inbox yet.
- Staff: `mayManage` in `staff.go` is the one rule, mirrored in `UsersPage`. A platform admin manages anyone; others only people wholly within their brands. `Server.current` re-reads the account on every request, so tokens carry identity and the database holds the role.
- Email links: `email_tokens` keeps only a hash, a link works once, and the newest of a kind replaces the rest. Forgot answers the same whether or not the address has an account. Only a proven inbox may fold guest records into an account (`claimGuestRecords`).
- Staff history: `staff_events` only ever gains rows, written in the same transaction as the change. A line's brands are the person's before and after; a line with none is for platform admins. Details never hold a password or a link.
- CQRS, phase 1: commands write documents through `service.run`; `readmodel.Apply` updates screen-shaped tables (`order_rows`) in the same transaction, and `GET /views/*` reads only those tables. Writes that skip the service (`claimGuestRecords`) project themselves. A read model can always be rebuilt from the documents (`readmodel.Rebuild`); the API rebuilds on boot when counts disagree.
- Never return a secret except from create and rotate (`writeSecret`, `Cache-Control: no-store`). Connector values stay behind `service.ConnectorValues`, which no route calls.

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
| Sell | Catalog (Products, Categories, Attributes, Modifiers, Inventory), Online store (Brand guideline, Domains & SEO) |
| Grow | Marketing (Campaigns, Promotions, Automations), Sales network (Leads, Sellers, Performance) |
| Insights & setup | Analytics, Integrations, Settings |

`sectionFor()` matches by the longest URL prefix, so a section may hold pages from any route folder (Leads lives at `/customers/leads` but belongs to Sales network). Add a page by adding a leaf; never derive sections from the first path segment.

## Page forms

- **List page** (this product's one list form, as in MES): `PageHeader` (one-sentence purpose, pill search, primary) → clickable `StatCard` tiles that apply filters → `ChipRow` of `Chip variant="filter"` with counts → `DataTable` on the canvas, no card. Reference: `pages/orders/OrdersPage.tsx`.
- **Detail page**: action bar (BackButton left; the next lifecycle step as primary, outline secondaries, an outline `MoreHorizontal` ActionMenu) → blocker note card → ink hero card (mono code, title, badges, metric grid) → `Steps` card → KeyValue cards in `lg:grid-cols-2` → related cards → history → dialogs. Reference: `pages/orders/OrderDetailPage.tsx`.
- **Gallery page** (sellers): PageHeader, StatCards as filters, ChipRow, `grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3` of stretched-link cards.
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

The admin has no Pages or Templates screens. Pages and templates come from the seed, and the storefront renders them. Sellers pick one of the existing templates on their personal store card; there is no section editor. `pages/setTemplate` and `sellers/setTemplate` rebuild a page's sections from the chosen template and carry headline, text, products and buttons over by section kind (`applyTemplate` in `store.ts`). Each revision stores its template, so a rollback restores both.

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

## Agentic commerce (demo, frontend only)

- Data: `Order.channel = 'agent'` with `Order.agent` (intent, cart and payment mandate ids, negotiated amount, products compared); `AgentPolicy` per tenant in `AppState.agentPolicies` (`agentPolicy/save`); `TrafficDay.agentVisits`. Seeded by `scripts/seed/agents.ts` on its own random stream.
- Shopper side: `/:store/agent` (`apps/storefront/src/features/AgentPage.tsx`) and the "Buy for me" tab of the store assistant share one conversation (`state/agentChat.tsx`, `AgentChatProvider` under `ShopProvider`), rendered by `components/AgentChat.tsx`. `lib/agent.ts` plans each run as a pure function: it reads the task (budget, options such as size), checks the store's policy, ranks the catalog by task words (product-name matches first, words most products share count less, a request that names a category stays in it), prices every open code with every allowed payment type and negotiates within `maxAutoDiscountPct`. The agent never buys on its own. After the animated search it asks, in order, which product, which variant (only when more than one fits), which courier and which discount; each question opens with the agent's suggestion and why, and marks that option. The shopper taps a row, types its number or name, or answers "pick for me". The cart then waits for "Approve and pay" (or "ya"); "Change shipping", "Change discount" and "Another product" reopen one question, "cheaper", "size 43" and "pay with OVO" re-run the search and keep what still applies. Orders go through `buildOrder`.
- Merchant side: `/commerce/agents` in the admin (policy, stats, agent vs human sessions, agent orders) and a mandate card on agent order details. Every agent order is approved by the shopper, so the policy has no approval threshold.

## Quick search and transaction codes

Every admin page has a three-letter code in `apps/admin/src/layouts/nav.ts`, and each create action adds a plus (`PRD`, `PRD+`). Cmd/Ctrl+K or `/` opens `QuickSearch`, where typing a code and pressing Enter opens that page; records open by their own code (`ORD-1042`). A new page takes a new code, and `packages/fixtures/test/transaction-codes.test.ts` refuses a missing or repeated one.
