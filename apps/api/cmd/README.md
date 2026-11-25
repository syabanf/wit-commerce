# Binaries

The API image holds four binaries built from this module. They share one Postgres database, and
`api` owns the schema: it migrates and seeds, and the others only connect.

| Binary | Port | Serves |
| --- | --- | --- |
| `api` | 8090 | Everything under `/api/v1`, the timer tick and webhook delivery. |
| `ai` | 8091 | `POST /api/v1/shop/{store}/ai/chat` and `GET /health`. |
| `notifier` | 8092 | Sends the queued email in `email_outbox`; `GET /health` reports the queue. |
| `shop` | 8093 | `GET /api/v1/shop`, `/shop/{store}/state`, `/shop/{store}/events` and `/health`. |

`api` alone runs the whole product. The other three take load off it and are off by default:
`scripts/deploy-prod.sh` starts them and routes traffic to them when `SPLIT_SERVICES=true`.

## What changes with SPLIT_SERVICES=true

- Compose starts the `split` profile: `ai`, `notifier` and `shop`.
- The API gets `EVENTS_NOTIFY=true`: every delta also goes out on the Postgres channel
  `commerce_events`, so `shop` streams see changes made through `api`. A change over the
  8000-byte NOTIFY limit goes into `event_log`, and the notification carries its id.
- The API gets `NOTIFIER_EXTERNAL=true` and stops draining `email_outbox` itself.
- The `web` container sends the AI chat path to `ai`, and GET requests on the three public shop
  paths to `shop`. Every other method and path stays on `api`.

Turning it off again is safe: `api` serves every route either way.

## Known limits

- The limits on public endpoints (sign-up, the subdomain check, sign-in, forgot password, shopper
  registration, the AI chat and the admin assistant) count in the `rate_limits` table, so every `api`
  and `ai` process shares one window per key. The tick deletes ended windows. When a count in
  Postgres fails, that process counts in its own memory until the database answers again. The limit
  on API keys stays in each process's memory.
- A `shop` stream misses changes sent while its LISTEN connection reconnects, or while the API's
  notify queue is full. Shoppers see them on the next reload.
- Email is sent at least once. A send cut off by a restart can arrive twice.
- Forgot-password and confirmation emails wait for the next drain, up to 2 seconds. Staff
  invitations and admin resets still send at once, because the admin sees the result.
- Sent `email_outbox` rows are kept without their body for 30 days, then pruned (see Performance and
  retention).

## Returns

A return (`returns`, owned by the orders module) covers some units of one order and moves
requested → approved → received → refunded, or ends rejected or cancelled. Staff start one from the
order page with `order.fulfil` or `ticket.manage`; the signed-in shopper asks from their order page
for a delivered order within the brand's return window (Online store → Domains & SEO, 7 days by
default, 0 turns shopper requests off). Approving, receiving and refunding need `order.refund`.
Receiving can put the units back on the shelf of the warehouse that shipped them, as stock moves of
kind `return`. A refund goes through the order's refund path, capped at what the returned items cost
after the order's discount (shipping stays) and at what the order has left.

An order's status follows its returns only at the end: when refunded returns cover every unit it
holds, the refund closes it as `returned`. A partial return leaves the status alone and shows in the
order's refunded amount, so the orders view `returns` still finds it. The console's state carries
open returns only; `GET /views/returns` pages through every return with counts per status.

## Shopper email

With email on and an address on the customer, a store emails its shoppers when an order is placed
(items, totals, and the order page with Pay now for a pending Midtrans payment, or the payment
type's instructions for a transfer), when the payment arrives, when the parcel ships (courier and
tracking number), when the order is cancelled or refunded, and when a return is approved or refunded.
Each brand can switch each kind off next to the return window. Every one is queued in the action's
own transaction (`kernel.Tx.Notify`, joined in `service/notices.go`), so it goes out only for a change
that committed. The Midtrans payment page opens after the order commits, so the order email links to
the order page, which carries Pay now. Each row carries a dedupe key (`kind:order id`, `kind:return id`,
or `order_refunded:order id:refunded total`) under a unique index, so a repeated notification or a
retried action queues one email. Every email, staff and shopper, uses one layout
(`modules/notifications/layout.go`): table-based, inline styles, a plain-text part, the brand's name,
logo and primary colour on store email and WIT Commerce's on platform email. The sentences live in
`modules/notifications/shopper.go` per language; English is the only one so far.

## Sales facts window

`sales_days`, `product_days` and `seller_buyers` keep the current month and the 13 whole months before
it: the console's longest daily read is the 12-month revenue chart, plus one spare month. The timer
rolls older days into `sales_months` and `product_months` once per WIB day, 50 tenant months per
transaction, deriving each month from the orders, so a rerun or a late refund to an old order gives
the same rows as `readmodel.Rebuild`. `seller_buyers` has no monthly form, since only the seller
screens read it, over 90 days at most. `/state` sends the daily window only; `GET /views/sales-months`
serves the months before it.

Every binary reads `.env` in its working directory for development runs; real environment
variables win.

## Plans and invoices

Each tenant sits on a plan, `starter`, `growth` or `enterprise`, that caps products, staff accounts,
sellers, warehouses, assistant questions a day, display currencies and media storage. A creation past
a cap answers 409 with the code `PLAN_LIMIT`; what a brand already has keeps working. The defaults
live in `internal/modules/billing` and `packages/fixtures/src/plans.ts` (a test keeps them equal). A
platform admin changes prices and caps in Settings, Plans, which saves them in `plan_settings`.

Sign-up puts a new store on Starter. A brand admin asks for a larger plan in Settings, Plan & usage;
a platform admin approves or declines it on the Plans page, and approval changes `tenant.plan`.

The tick writes one invoice per tenant on a paid plan per month (`invoices`, unique per tenant and
month). No payment provider is wired for subscriptions: payment is arranged with the platform, and a
platform admin marks each invoice paid or void.

## Cloudflare Turnstile

Store sign-up (`/start`) and shopper registration can ask for a Turnstile check. It is off until a
platform admin saves keys, and with no keys nothing changes.

1. The operator creates a widget in the Cloudflare dashboard under Turnstile, adds the admin host
   and the store hosts (for example `commerce.reddie.id` and `*.commerce.reddie.id`, or each store
   host if the wildcard is refused), and copies the site key and the secret key.
2. In the admin, open Settings, Plans, and save both keys under Bot check. The secret is encrypted
   with `CREDENTIALS_KEY` like the email key; the console shows only its last four characters.
3. `GET /api/v1/config` now returns the site key, and the two forms render the widget. The API
   checks each token at `https://challenges.cloudflare.com/turnstile/v0/siteverify` through the
   outbound client. A missing or refused token answers 422 `CAPTCHA_FAILED`; when Cloudflare cannot
   be reached the answer is 503 `CAPTCHA_UNAVAILABLE`.

Clear both keys and save to turn the check off.

## Store subdomains

Each brand's store opens on its own host, `https://{subdomain}.commerce.reddie.id`. The storefront
reads the store from the host name and still calls `/api/v1/shop/{store}/...`, so the API needs no
change. The `web` container (`docker/web/`) serves store hosts when `STORE_ROOT_DOMAIN` is not empty.

Settings:

| Variable | Where | Meaning |
| --- | --- | --- |
| `STORE_ROOT_DOMAIN` | API, `web`, deploy script | Parent domain of store hosts. Email links and the payment return go to `https://{subdomain}.{root}`. Unset on the API means `commerce.reddie.id`; set but empty keeps `{PUBLIC_URL}/shop/{subdomain}`. The deploy script saves it in `.env.production` and defaults it to empty. |
| `VITE_STORE_ROOT_DOMAIN` | `web` image build arg | The same root, compiled into the admin, the seller app and the storefront; Compose passes `STORE_ROOT_DOMAIN`. The admin shows `{subdomain}.{root}` as the store address and previews the store on that origin. |
| `MEDIA_ROOT` | Compose, deploy script | Host folder for uploaded images, `/var/lib/commerce/media` by default, mounted read-write at `/media` in the API (`MEDIA_DIR`) and read-only in `web`, which serves it at `/media/`. |

With a root set, `web` adds a server for `*.{root}` that serves the storefront built for the root, with
the same `/api/` proxy and `/media/`. The main host keeps the admin and answers old `/shop/{store}/...`
links with a 301 to `https://{store}.{root}/...`. The image holds both storefront builds, so switching
modes needs only a new `STORE_ROOT_DOMAIN` and `up --build` (the admin compiles the root in). A store
that is not published shows a Coming soon page on its host.

DNS: add a wildcard record for `*.commerce.reddie.id`, an A record to the server's address or a CNAME
to the main host.

TLS: Cloudflare Universal SSL covers `commerce.reddie.id` and `*.reddie.id`, but not a second-level
wildcard such as `*.commerce.reddie.id`. Pick one:

- Cloudflare Advanced Certificate Manager, which can issue `*.commerce.reddie.id` on the proxied
  record. Nothing changes on the server.
- A Let's Encrypt wildcard through the DNS-01 challenge, with the wildcard record set to DNS only
  (grey cloud). For example with certbot and its Cloudflare plugin, using an API token limited to
  editing DNS on the zone:

  ```sh
  certbot certonly --dns-cloudflare --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
    -d 'commerce.reddie.id' -d '*.commerce.reddie.id'
  ```

  Then copy `fullchain.pem` and `privkey.pem` from `/etc/letsencrypt/live/commerce.reddie.id/` with `cp -L` (they are symlinks) into
  `deploy/certs/` (or point `WEB_CERTS` at a folder holding them) and deploy again. `web` then serves
  HTTPS on 443 for the main host and every store host, and redirects port 80 to it. After each renewal,
  copy them again and run `docker compose -p commerce-prod restart web`.

Before the wildcard record and certificate exist, deploy with `STORE_ROOT_DOMAIN=` (empty). Every store
then stays on one host at `{PUBLIC_URL}/shop/{subdomain}`: `web` serves the storefront built under
`/shop/` there, and the API writes links in that form. The script saves the choice in
`.env.production`; deploy again with `STORE_ROOT_DOMAIN=commerce.reddie.id` once DNS and TLS are ready.

In development `STORE_ROOT_DOMAIN` and `VITE_STORE_ROOT_DOMAIN` are `localhost:5375`. Browsers resolve
`*.localhost` to this machine, so `http://lari.localhost:5375` opens the lari store from `pnpm dev`,
and `http://localhost:5375/lari` still works. The storefront dev server proxies `/api` to port 8787, so
store hosts reach the API on their own origin.

## Custom domains

A brand can open its store on a domain it owns, such as `www.tokosaya.com`, next to its subdomain.
The subdomain keeps working and is never redirected.

How it runs:

1. In Domains & SEO the owner enters the domain. `PUT /api/v1/tenants/{id}/domain` checks it (lowercase
   host name, a public ending, no IP address, port or `localhost`, not the platform's own hosts or any
   `*.{STORE_ROOT_DOMAIN}`) and refuses one another brand holds with 409 `DOMAIN_TAKEN`; `www.` and the
   bare name count as one. The API stores the domain unverified with a fresh token.
2. The owner adds two records at their DNS provider: a TXT record at `_wit-commerce.{domain}` holding the
   token, and a CNAME from the domain to `{subdomain}.{STORE_ROOT_DOMAIN}` (or to `DOMAIN_TARGET`). A
   root domain that cannot hold a CNAME may use A records to the `DOMAIN_TARGET_IPS` instead.
3. Check DNS calls `POST /api/v1/tenants/{id}/domain/verify`. The API asks DNS (5 seconds at most) and
   answers with each record's expected and found values. Both right marks the domain verified.
4. From then on `GET /api/v1/shop/by-host?host=` answers with the store for that host, with or without
   `www.`, and email links, the payment return and the admin's store links use the domain. An unverified
   domain never answers.
5. The timer checks every verified domain again once a day. After 3 failures in a row the domain stops
   being verified, so a domain that moved away stops serving the store. Check DNS brings it back.

Settings:

| Variable | Where | Meaning |
| --- | --- | --- |
| `DOMAIN_TARGET` | API | Another name a brand's CNAME may point at, such as `stores.example.com` on a proxy. The console shows it in place of the store host. |
| `DOMAIN_TARGET_IPS` | API | Comma-separated addresses A records may hold. Empty means a domain needs a CNAME. |
| `DOMAIN_ASK_SECRET` | API | When set, `GET /api/v1/internal/domain-allowed` needs it as `?secret=`. |
| `PUBLIC_URL` | `web` | With `STORE_ROOT_DOMAIN` set, the admin answers on this host and `localhost` only, and every other host gets the store build, which asks `by-host` which store it is. An unknown host shows "No store at this address". Empty keeps the admin on every host. |

The storefront calls `/api` on its own origin, so custom domains need no CORS change. The admin's
preview frame keeps using the subdomain origin.

### TLS for custom domains

This stack does not issue certificates for brands' domains. The certificate in `deploy/certs` covers the
platform's names only, and the console never claims HTTPS for a custom domain. Pick one of these and put
it in front of `web`:

- **Cloudflare for SaaS (custom hostnames).** Keep the platform zone on Cloudflare and add each verified
  domain as a custom hostname; Cloudflare issues and renews its certificate. Set `DOMAIN_TARGET` to the
  fallback origin name Cloudflare gives you, so brands point their CNAME there. `web` keeps serving plain
  http on 80 behind it.
- **A proxy with on-demand TLS, such as Caddy.** Run it on ports 80 and 443 and let `web` listen on a local
  port (`WEB_BIND=127.0.0.1 WEB_PORT=8080 WEB_TLS_PORT=8443`, no certificates mounted). Before Caddy asks
  Let's Encrypt for a certificate, it calls the `ask` endpoint, which answers 200 only for a verified
  domain. The API port is bound to `127.0.0.1` and `web` answers 404 for `/api/v1/internal/`, so only a
  proxy on the same machine reaches it; set `DOMAIN_ASK_SECRET` as well when anything else shares that
  machine.

  ```caddyfile
  {
    on_demand_tls {
      ask http://127.0.0.1:8090/api/v1/internal/domain-allowed?secret={$DOMAIN_ASK_SECRET}
    }
  }
  https:// {
    tls {
      on_demand
    }
    reverse_proxy 127.0.0.1:8080
  }
  ```

  Keep the platform's own names (the console and `*.{STORE_ROOT_DOMAIN}`) on their own site blocks with
  the wildcard certificate, since the ask endpoint answers 404 for them.

## Storefront search

`GET /api/v1/shop/{store}/search` answers the storefront's search page from Postgres with `pg_trgm`
(migration 0035). Parameters: `q`, `category` (its sub-categories count too), `collection` (slug or
id), `attr.{code}` (repeat for any of several values), `priceMin` and `priceMax` (rupiah, inclusive),
`inStock=1`, `sort` (`relevance`, `price_asc`, `price_desc`, `newest`, `best`), `page` and `pageSize`
(24, at most 60). Only active products of a live store come back.

- Matching: `products.search_text` is a stored generated column of the folded name, code, tags, best
  for, variant SKUs and barcodes, and attribute values (`product_search_text`), with a GIN trigram
  index. Folding lowers case, strips Latin accents and turns punctuation into spaces (`search_fold`
  in SQL, `service.FoldSearch` in Go). Every query word must match: by `word_similarity` of at least
  0.55 (one typo in a six-letter word still finds it), as the start of a word for words under three
  letters, or through the name of the product's category or its parent. A small table of Indonesian and
  English pairs (`sepatu` and `shoes`, `kaos` and `tshirt`, `wanita` and `women`) lets either word
  match (`service/search_text.go`).
- Ranking for `relevance`: the exact name, then names that start with the query, then a name word
  that does, then the whole query typed elsewhere (a SKU, a code, a category name), then by how well
  the words match the name, then by views and newest.
- Facets: categories (with parents counted), each filterable attribute's values, price buckets
  (under 100 rb up to 5 jt and above) and the in-stock count, each ignoring its own filter.
- "Did you mean": when the words find nothing, each word is swapped for the closest word of the
  store's vocabulary, and the suggestion is offered only if it finds something.
- `GET /api/v1/shop/{store}/suggest?q=` gives the search box the top 5 products and categories.

A first-page search with words and no filters counts in the brand's `searchTerms` (Analytics → Product:
top searches and searches with no or few results): one row per folded term, searches per WIB day for
the last 30 days, `count30d` their sum and `results` the latest count. Terms that look like an email
address or a phone number are not kept, each client adds at most 30 terms a minute, and a store keeps
at most 5,000 terms.

Measured on a laptop (Postgres 17 in Docker under colima) with 4,000 generated products in one store,
30 runs each (`SEARCH_LATENCY=4000 go test ./internal/service -run SearchLatency -v`): one word p50
21 ms, a typo 22 ms, two words 46 ms, a synonym matching 2,500 products 72 ms, filters without words
14 ms, no match with "did you mean" 25 ms. Most of it is `word_similarity` on the rows that match, so
the time follows the size of the result set more than the catalogue.

## Sitemaps and robots.txt

Each store serves `sitemap.xml` and `robots.txt` on every address it answers:

| Address | Served by |
| --- | --- |
| `{store}.{STORE_ROOT_DOMAIN}/sitemap.xml`, `/robots.txt` | `web` sends them to `GET /api/v1/seo/sitemap.xml` and `/seo/robots.txt`, which pick the store from the `Host` header (`docker/web/templates/commerce/seo.inc.template`). |
| A verified custom domain, the same paths | The same routes: a host that is not under the root must be a verified custom domain. |
| `{PUBLIC_URL}/shop/{store}/sitemap.xml`, `/robots.txt` (no store root) | `web` sends them to `GET /api/v1/shop/{store}/sitemap.xml` and `/robots.txt` (`shop-path.inc.template`). |

The sitemap lists home, published store pages, categories, collections, active products and the
personal pages of active sellers, each with `lastmod` from the row's `updated_at`. Every URL is on the
store's canonical origin: the verified custom domain, else `https://{store}.{root}`, else
`{PUBLIC_URL}/shop/{store}`, whichever address the crawler used. Past 50,000 URLs `sitemap.xml` is an
index of `sitemap/1.xml`, `sitemap/2.xml` and so on.

robots.txt lets every crawler in, keeps it out of the cart, checkout, account, orders, wishlist, page
previews and search results with a query (`/search?`), and names the sitemap. A store that is not open
yet (no published homepage) answers `Disallow: /` and has no sitemap. Both answers may be cached for an
hour.

The storefront sets `<link rel="canonical">` and Open Graph tags on every page from the same origin,
and product pages add schema.org `Product` data with the offer in IDR (`apps/storefront/src/lib/seo.ts`).

## Midtrans sandbox

A brand that saves Midtrans keys collects real payments at checkout. A brand without keys keeps the
simulated checkout: non-COD orders are placed paid.

How it runs: the API places a Midtrans order `pending` whatever the browser sent, creates a Snap
transaction (order id as `order_id`, the order total as `gross_amount`) and answers with its
`redirectUrl`. The storefront sends the shopper there. Midtrans posts to the notification URL; the
API checks the signature, asks Midtrans for the status, and marks the order paid on `settlement` or
an accepted `capture`, or cancels it on `expire`, `cancel` or `deny`. The order page shows Pay now
while the order waits, and turns paid over the store's event stream when the notification lands.
The admin's order page shows the Midtrans status, transaction id and last notification time.

To test by hand:

1. Sign in to the Midtrans dashboard in sandbox mode and copy the server key and client key from
   Settings → Access Keys. Sandbox keys start with `SB-`.
2. In the admin, open Settings → App marketplace, pick the brand, open Midtrans, paste both keys and
   save. Turn the integration on, then press Test connection: it should say Midtrans accepted them.
3. In the Midtrans dashboard, set Settings → Configuration → Payment Notification URL to
   `{PUBLIC_URL}/api/v1/payments/midtrans/notification`. Midtrans must reach that address over
   HTTPS, so a laptop needs a tunnel such as `cloudflared tunnel --url http://localhost:8787`.
4. Set `STORE_ROOT_DOMAIN` or `PUBLIC_URL` on the API, so Midtrans sends the shopper back to
   `https://{store}.{STORE_ROOT_DOMAIN}/order/{id}`, or to `{PUBLIC_URL}/shop/{store}/order/{id}` when
   `STORE_ROOT_DOMAIN` is empty. Without either the API uses the request's `Origin` when it is in
   `ALLOWED_ORIGINS`.
5. Check out on that brand's storefront with QRIS, a virtual account, GoPay or a card. The
   storefront opens the Snap page.
6. Pay with Midtrans's sandbox tools:
   - Card: `4811 1111 1111 1114`, any future expiry, CVV `123`, OTP `112233` (accepted). A card
     ending `1112` with the same details is denied.
   - Virtual account, QRIS and GoPay: open the Midtrans simulator at
     `https://simulator.sandbox.midtrans.com`, pick the method, paste the VA number or QR link the
     Snap page shows and pay.
7. Watch the order page turn paid without a reload, and the admin order page show `settlement`
   with the transaction id. Midtrans's dashboard lists the notification under Transactions.
8. To test expiry, leave a VA unpaid; Midtrans sends `expire` when it lapses (24 hours by default)
   and the order is cancelled. The API's own timer cancels it after 24 hours too.

The notification is safe to repeat: a second `settlement` changes nothing, and a notification with a
bad signature answers 401 and changes nothing.

## Performance and retention

### Environment

| Variable | Default | Effect |
| --- | --- | --- |
| `DB_MAX_CONNS` | 16 | Pool size per process (`api`, `ai`, `notifier`, `shop` each open one pool). |
| `DB_MIN_CONNS` | 0 | Connections the pool keeps open while idle. |
| `DB_MAX_CONN_LIFETIME` | `1h` | A connection is closed and replaced after this long. |
| `DB_MAX_CONN_IDLE_TIME` | `30m` | An idle connection is closed after this long. |
| `PASSWORD_HASH_SLOTS` | half the CPUs, at least 1 | Password hashes and checks that run at once (`api` only). |
| `PASSWORD_HASH_WAIT` | `5s` | How long a sign-in waits for a slot before the answer is 503 with `Retry-After: 2`. |
| `RETAIN_REQUEST_LOG_DAYS` | 30 | `request_log` rows older than this are deleted. |
| `RETAIN_WEBHOOK_DELIVERIES_DAYS` | 30 | Delivered and failed `webhook_deliveries`; pending ones stay. |
| `RETAIN_EMAIL_OUTBOX_DAYS` | 30 | Sent and given-up `email_outbox` rows; unsent ones stay. |
| `RETAIN_STOCK_MOVES_YEARS` | 10 (floor 10) | `stock_moves`, transaction data under PP 80/2019 Pasal 25. |
| `RETAIN_INTEGRATION_LOGS_YEARS` | 5 (floor 5) | `integration_logs`, other PMSE data. |
| `RETAIN_TRAFFIC_YEARS` | 5 (floor 5) | `traffic`, other PMSE data. |
| `RETAIN_AUDIT_LOG_YEARS` | 5 (floor 5) | `audit_log`, the record of who changed what; other PMSE data. |
| `RETAIN_PRODUCT_IMPORTS_DAYS` | 30 | `product_imports`, the working copy of an uploaded product CSV. |
| `RETAIN_TRANSACTIONS_YEARS` | 10 (floor 10) | Orders with their payments, refund attempts, returns and invoice numbers, after the order's last activity; platform invoices after issue. |
| `RETAIN_CUSTOMERS_YEARS` | 5 (floor 5) | Customers after their last activity: anonymised through the erasure path, deleted with their timeline, tickets and leads once no order is left. |
| `RETAIN_PRIVACY_REQUESTS_YEARS` | 5 (floor 5) | Completed `privacy_requests`, after completion. |

Durations are Go durations (`90s`, `30m`, `2h`). A retention of 0 keeps that table forever; a value
below its legal floor is raised to the floor with a warning at start. An unreadable pool or password
value stops the process at start.

### Retention

The tick (every minute) calls `service.PruneIfDue`, which does the work at most once an hour across
every API process: it claims the hour by updating the `meta` row `retention_pruned_at`. Each table
gets deletes of 5,000 rows, at most 20 per run, so a first run over a large backlog commits in pieces
and leaves the rest for the next hour. Migration 0032 indexes each prune condition. The core records
follow `service/retention_core.go` (migration 0040 indexes them): orders and what hangs off them go 500
at a time, customers past their period are anonymised through the erasure path, 200 a run.
`docs/compliance.md` (Performance and retention) explains the periods.

### Sign-in under load

PBKDF2-SHA256 at 600,000 iterations costs about 350 ms of CPU per hash or check, by design. The
password gate (`auth.PasswordGate`) lets `PASSWORD_HASH_SLOTS` run at once and queues the rest for up
to `PASSWORD_HASH_WAIT`, so a burst of sign-ins cannot take every core from the requests already
being served. The per-IP (30 a minute) and per-email (10 a minute) sign-in limits still run first, so a
refused attempt never reaches the gate. Staff and shopper sign-in, password changes, resets, sign-up,
shopper registration and staff invitations all go through it.

Measured on the scaled copy (10 cores, 5 slots): a burst of 60 sign-ins took the health check from
200 ms to 2 ms; a burst of 200 answered 154 within 5 s and told 46 to retry.

### Indexes and generated columns (migration 0031)

| Index | Serves |
| --- | --- |
| `orders_open_idx` (partial, open statuses) | Open orders in `GET /state`; the tick's unpaid-order scan. |
| `customers.seller_id` + `customers_seller_idx` | A sales user's customers: state, event stream, segment counts, order views, assistant. |
| `sellers.user_id` + `sellers_user_idx` | A staff user's seller profiles, on every request from a sales user and at sign-in. |
| `leads.customer_id`, `tickets.customer_id` + indexes | Guest merges and personal data requests. |

Each generated column is the same expression the queries used before (`data->>'sellerId'` and so on),
so the answers do not change. `returns_order_idx` existed already (0023). `users` has no index on
`data->'tenantIds'`: the table holds staff only, a few rows per brand, and a scan of it takes under
0.1 ms; add a GIN index on `(data->'tenantIds')` if it grows past a few thousand rows.

Migrations run inside a transaction, so they use plain `create index`, which blocks writes to that
table while it builds (well under a second at today's sizes). On a production table with millions of
rows, build the index first by hand, outside a transaction, then deploy; `if not exists` turns the
migration's statement into a no-op:

```sql
create index concurrently if not exists customers_seller_idx on customers (seller_id);
```

A stored generated column cannot be added concurrently: `alter table ... add column ... generated`
rewrites the table under an exclusive lock. On a large table, plan a short maintenance window, or add
a plain column, backfill it in batches and switch the queries afterwards.

### Postgres settings (docker-compose.prod.yml)

The production compose starts Postgres with settings for a VPS with 2 to 4 GB of RAM and an SSD,
shared with the API and nginx. Each can be overridden from `.env.production` where it has a variable.

| Setting | Value | Why |
| --- | --- | --- |
| `shared_buffers` (`PG_SHARED_BUFFERS`) | 512MB | A quarter of 2 GB, an eighth of 4 GB; the rest stays for the API and the OS cache. |
| `effective_cache_size` (`PG_EFFECTIVE_CACHE_SIZE`) | 1536MB | What the planner may expect the OS to cache. |
| `work_mem` (`PG_WORK_MEM`) | 8MB | Per sort or hash; 80 connections with a few sorts each stay inside RAM. |
| `maintenance_work_mem` (`PG_MAINTENANCE_WORK_MEM`) | 128MB | Faster index builds and vacuum. |
| `max_connections` (`PG_MAX_CONNECTIONS`) | 80 | Four processes at `DB_MAX_CONNS` 16 is 64, plus room for psql and backups. Raise it when you raise a pool or add replicas: pools times processes plus 16. |
| `random_page_cost` | 1.1 | SSD: random reads cost about the same as sequential ones, so the planner uses indexes. |
| `effective_io_concurrency` | 200 | SSD. |
| `log_min_duration_statement` | 500ms | Slow statements go to the Postgres log. |
| `shared_preload_libraries` | `pg_stat_statements` | Per-statement timing. Run `create extension if not exists pg_stat_statements;` once in the `commerce` database to read the `pg_stat_statements` view. |

On 8 GB or more, raise `PG_SHARED_BUFFERS` to a quarter of RAM and `PG_EFFECTIVE_CACHE_SIZE` to
half. The dev compose keeps Postgres defaults.


### Load profiles (k6)

`perf/k6` holds one k6 script per profile; each fails on its thresholds.

| Profile | Load | Thresholds |
| --- | --- | --- |
| `admin-state` | `GET /state`, 5 tenant admins and 5 sales users | p95 under 2 s (admin) and 1.5 s (sales), no errors, body under 3 MB uncompressed |
| `customers` | `GET /views/customers` (list, search, filters) and `GET /views/customer-summary`, 5 sessions each | list p95 under 3 s, summary p95 under 300 ms, no errors |
| `storefront` | `GET /shop/{store}/state` then a revalidation with `If-None-Match`, search and suggest | state p95 under 500 ms, every revalidation a 304, search under 600 ms, suggest under 400 ms |
| `checkout` | guest checkouts with cash on delivery, 5 at once, built as the storefront builds them | no errors, p95 under 1.5 s |
| `order-advance` | 30 staff sessions moving 300 different open orders a step at once | no errors, p95 under 3 s |

`perf/scale.sql` multiplies the demo seed for them: every brand's orders, customers, customer events,
order rows and customer metrics get `copies` more copies with suffixed ids and codes (`x3`, `X3`). Run
it once on a freshly seeded database with the API stopped. CI uses 19 copies, 20 times the seed.

Run locally against a scratch database (never the one you work in, the profiles place and advance
orders):

```sh
createdb -h localhost -p 5433 -U commerce commerce_perf
cd apps/api && go build -o /tmp/perf-api ./cmd/api && cd ../..
export DATABASE_URL='postgres://commerce:commerce@localhost:5433/commerce_perf?sslmode=disable'
export JWT_SECRET=perf-local-secret-0123456789abcdef DEMO_PASSWORD=perf-demo-pass PORT=8095
SEED_DIR=$PWD/packages/fixtures/data /tmp/perf-api &   # seeds, then stop it once /api/v1/health answers
kill %1
psql "$DATABASE_URL" -v copies=19 -f perf/scale.sql
(cd /tmp && ./perf-api &)                              # from outside the repo, so it skips apps/api/.env
BASE_URL=http://localhost:8095 ./perf/run.sh
```

Measured on the 50 times copy (34k orders and 36k customers in one brand), Postgres 17 in Docker with
2 CPUs, before and after wave 8: `GET /state` 2.50 MB to 2.04 MB for a tenant admin with p95 about
600 ms; customer summary p95 4.9 s to 7 ms (cached; about 160 ms cold); storefront state and 304 p95
about 200 ms, search 140 ms, suggest 110 ms; checkout went from 80% answering 500 (two guests took the
same customer code) to none, p95 400 ms; 300 concurrent order advances all succeed, p95 550 ms. The
customers list reached p95 1.5 s with 5 sessions, and Docker's 64 MB shared memory failed some of its
parallel queries (see below).

`PROFILES="customers storefront"` runs some of them, `DURATION=10s` shortens each, and the summaries
land in `perf/out/<profile>.json`. `scripts/perf-terms-version.ts` prints the store's terms version,
which a checkout must carry; `run.sh` passes it to k6 as `TERMS_VERSION`.

The `perf` job in `.github/workflows/ci.yml` does the same on pushes to `main`, on a manual run and on
pull requests that touch `apps/api` or `perf`, and keeps the summaries and the API log as the
`k6-summary` artifact. Its Postgres gets 256 MB of shared memory: with Docker's default 64 MB, parallel
query workers under load fail with "could not resize shared memory segment".
