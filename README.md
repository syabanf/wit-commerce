# WIT Commerce

A multi-tenant commerce platform with built-in CRM, brand governance and personal storefronts for every seller. This repository holds the admin console for brand teams, the phone app for sales agents, the shopper storefront and the Go API behind them. Without the API configured, every app runs on its bundled seed data.

Product brief: `docs/unified-commerce-os.md` (Brand → Store → Product → Customer → Transaction → Engagement → Retention).

## Run it

```
pnpm install
pnpm dev:admin     # http://localhost:5373
pnpm dev:mobile    # http://localhost:5374
pnpm dev:storefront  # http://localhost:5375/lari, /aruna, /teknika
```

With `VITE_STORE_ROOT_DOMAIN=localhost:5375` (set in `.claude/launch.json`) each store also opens on its own host, http://lari.localhost:5375. Browsers send `*.localhost` to this machine without a hosts file. New stores come from http://localhost:5373/start, where anyone can sign up and get `{name}.{root}`.

Sign in with any demo account on the login screen; any password works on the bundled data. Against the API the password is the shared demo password (`commerce-demo` unless `DEMO_PASSWORD` says otherwise).

| Account | Role | Brands |
|---|---|---|
| Dewi Lestari | Platform admin | all three |
| Andi Pratama | Tenant admin | Lari Running Co., Aruna Beauty |
| Hendra Wijaya | Tenant admin | Teknika Industrial |
| Maya Putri | Marketing | Lari, Aruna |
| Budi Santoso | Commerce operations | all three |
| Sari Wulandari | Customer service | Lari, Aruna |
| Fahmi Rahman, Sherlyn Tan, Rizky Hidayat | Sales agents (phone app) | their brands |

The demo clock starts on Monday 5 October 2026, 09:41 WIB and runs forward. On the bundled data, changes persist in the browser; "Reset demo data" on the phone app or clearing site data restores the seed. Against the API, one dataset serves every app and every browser.

### With the Go API

```
pnpm db:up                 # Postgres 17 in Docker, port 5433
pnpm dev:api               # http://localhost:8787/api/v1 (migrates, seeds an empty database, runs the jobs)
pnpm --filter @rc/admin exec vite --mode api        # the console on the API, port 5373
pnpm --filter @rc/storefront exec vite --mode api   # the storefront on the API, port 5375
pnpm --filter @rc/mobile exec vite --mode api       # the seller app on the API, port 5374
```

`apps/api/.env.example` lists the API's environment; `apps/*/.env.api` points each app at the local API (`VITE_API_URL`). `pnpm --filter @rc/server reset` empties the database and loads the seed again.

## Connecting other systems

- **OpenAPI:** the API publishes its contract at `/api/v1/openapi.json`, with a reference at `/api/v1/docs`; `apps/api/openapi.json` is the same document in the repo for client generators.
- **API keys (inbound):** Integrations → API credentials creates, rotates and revokes keys per brand, each with its scopes and optional expiry. Send one as `Authorization: Bearer rck_…` or `X-Api-Key`. The secret shows once; the server keeps its SHA-256. Limit: 600 requests a minute per key.
- **Connector credentials (outbound):** the Credentials button on each connection stores what WIT Commerce needs to call that provider, encrypted with AES-256-GCM. Values go in and never come back through the API.

- **Webhooks (outbound):** the same page adds endpoints per brand. WIT Commerce POSTs `{event, tenantId, at, data}` signed in `X-Commerce-Signature: t=<unix>,v1=<hex>` (HMAC-SHA256 of `<unix>.<raw body>`), and retries non-2xx answers for about a day. Endpoints must be https and public; `WEBHOOK_ALLOW_INTERNAL=true` relaxes that in development.
- **Testing a connection:** "Test saved values" makes a real read-only call for Midtrans and Xendit. Other providers store their values without a live check. No provider handles payments or shipments through WIT Commerce yet.

- **AI in the shopper chat:** the buying agent and the store assistant read shoppers' words with DeepSeek on Ollama (`OLLAMA_API_KEY`, `OLLAMA_MODEL`, default `deepseek-v4.1-flash`). The key stays in the API's environment, `apps/api/.env` locally, which git ignores. The model only interprets: it sees the store's public catalog and the shopper's words, and it has no action that pays. Without a key, or when it fails, the chat falls back to the built-in parser. Set `TRUST_PROXY=true` behind a reverse proxy so the limit of 30 messages a minute counts each shopper.

All of these need the API (`VITE_API_URL`). Every change lands in an audit trail, without values.

## Workspace

| Path | Contents |
|---|---|
| `packages/types` | domain model: unions with labels and flows, entities |
| `packages/fixtures` | seed loader, reducer store, blockers, permissions, derivations, analytics, journey tests |
| `packages/ui` | WIT component kit and SVG charts |
| `packages/tailwind-config` | design tokens (`theme.css`) |
| `apps/admin` | admin console |
| `apps/mobile` | sales agent PWA |
| `apps/storefront` | shopper storefront per tenant |
| `apps/api` | Go API: Postgres, every store action as an endpoint, auth, server-sent events (`@rc/server`) |
| `packages/api` | the TypeScript client: one request per action, deltas laid over the app state |
| `scripts` | seeded, deterministic data generator |
| `docs/frontend-conventions.md` | how to add a page |

## Checks

```
pnpm gen:fixtures   # regenerate the seed (deterministic)
pnpm gen:golden     # record what the TypeScript reducer does, for the API parity test
pnpm gen:openapi    # regenerate apps/api/openapi.json from the route table
pnpm typecheck      # TypeScript and go vet
pnpm lint
pnpm test           # journey tests on the reducer
pnpm test:api       # Go tests: seed fidelity and parity with the reducer (TEST_DATABASE_URL, a database the tests may empty)
pnpm build
```

The parity test replays the golden cases (`apps/api/testdata/golden.json`) through the Go service and compares every row it writes with what the reducer wrote. CI runs it against a Postgres service container.

## Palette and contrast

WIT red accent on a near-black ink. Tenant storefront colours are data (`Tenant.brand`) and render only inside storefront previews.

| Pair | Ratio | Minimum |
|---|---|---|
| white on ink `#101112` | 18.9 | 4.5 |
| white on accent-strong `#c9141b` | 5.8 | 4.5 |
| on-ink-muted `#b8b8b8` on ink | 9.5 | 4.5 |
| muted `#686868` on surface `#f1f0f1` | 4.9 | 4.5 |
| accent-strong on accent-soft `#fdeced` | 5.1 | 4.5 |

## Production

The admin runs at https://commerce.reddie.id. Stores run at https://commerce.reddie.id/shop/{store}, or, once `STORE_ROOT_DOMAIN` is set and its wildcard DNS record and certificate exist, at https://{store}.commerce.reddie.id. See "Store subdomains" in [apps/api/cmd/README.md](apps/api/cmd/README.md).

Everything runs from Docker: `docker-compose.prod.yml` starts Postgres, the API (`apps/api/Dockerfile`) and `web` (`docker/web/Dockerfile`), an nginx image that holds the admin at `/`, the storefront under `/shop/` or on store hosts, and the seller app under `/seller/`, and proxies `/api/` and `/media/`. Only `web` faces the network; the API listens on 127.0.0.1.

- Whole stack on a laptop, one command after copying the example env file (dummy values only):

  ```sh
  cp deploy/.env.docker.example deploy/.env.docker
  docker compose -f docker-compose.prod.yml --env-file deploy/.env.docker up --build
  ```

  Then open http://localhost:8080, http://localhost:8080/shop/lari and http://localhost:8080/seller/. `down -v` deletes the data.
- Production server: install Docker with the Compose plugin and git, clone the repository and run `./scripts/deploy-prod.sh`. It asks for the Ollama key once, generates the other secrets into `.env.production` (mode 600, ignored by git), turns demo login off, builds and starts every container, creates the platform admin and prints their first password once (`RESET_ADMIN=1` prints a new one), and checks the API, the web server and the model. Run it again to deploy a new version. `SPLIT_SERVICES=true` also runs the AI chat, the storefront reads and the email worker as their own containers; see [apps/api/cmd/README.md](apps/api/cmd/README.md).
- Ports: `web` listens on `WEB_BIND:WEB_PORT` (0.0.0.0:80). If a host nginx or another process already holds 80 or 443, the script stops, leaves it alone and prints a proxy snippet for it; deploy with `WEB_BIND=127.0.0.1 WEB_PORT=8080 WEB_TLS_PORT=8443` and proxy to that.
- TLS: behind Cloudflare or another proxy, `web` serves plain http on 80 as it is. To terminate TLS in `web`, put `fullchain.pem` and `privkey.pem` in `deploy/certs/` (or the folder in `WEB_CERTS`): it then serves HTTPS on `WEB_TLS_PORT` (443) and redirects 80 to it. Restart `web` after renewing them.
- Media: uploaded images live in the host folder `MEDIA_ROOT` (`/var/lib/commerce/media`, owned by uid 10001). The API writes it and `web` serves it read-only at `/media/`. Back it up with the database. A plain name such as `MEDIA_ROOT=media` uses a Docker volume instead, as the laptop example does.
- Build-time values: Vite compiles `VITE_API_URL` (`/api`), `VITE_STORE_ROOT_DOMAIN`, `VITE_STOREFRONT_URL` and `VITE_ADMIN_ORIGINS` (both from `PUBLIC_URL`) and `VITE_DEMO_PASSWORD` into the `web` image as build args, so changing `PUBLIC_URL`, `STORE_ROOT_DOMAIN` or `DEMO_LOGIN` needs `up --build`. `VITE_DEMO_PASSWORD` stays empty unless `DEMO_LOGIN=true`, and then it is public. Build args show in the image history, so none of them may hold a secret.
- API alone: `docker build -f apps/api/Dockerfile -t commerce-api .` (the seed is copied in), or `go build ./cmd/api` inside `apps/api`. It needs `DATABASE_URL`, `JWT_SECRET` (32+ characters), `CREDENTIALS_KEY` (`openssl rand -base64 32`; back it up, connector secrets cannot be read without it) and, for the demo accounts, `DEMO_PASSWORD`; set `DEMO_LOGIN=false` to turn the demo sign-in endpoints off. It listens on `PORT` (8090) and serves `/api/v1/*`.
- Storefront builds outside Docker use base `/shop/` (`STOREFRONT_BASE=/` builds it for store hosts), and `pnpm --filter @rc/storefront preview` serves the build at http://localhost:4375/shop/. The seller app builds at the root unless `SELLER_BASE=/seller/` is set, as the `web` image does.
- Email: Resend sends password resets and shopper confirmations (`RESEND_API_KEY`, `EMAIL_FROM` on a domain verified in Resend, `PUBLIC_URL`). Without a key those flows answer that email is off. Confirming an email folds earlier guest orders with that address into the account.
- Staff: Settings → Users & roles adds staff, edits their role and brands, disables accounts and resets passwords. With email on, the person gets a link and the admin never sees a password; with email off, the server shows a temporary password once. A role change, a disabled account or a reset applies on the person's next request.
