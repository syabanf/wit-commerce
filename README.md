# Commerce OS

A multi-tenant commerce platform with built-in CRM, brand governance and personal storefronts for every seller. This repository holds the frontend: an admin console for brand teams and a phone app for sales agents, running on seeded demo data.

Product brief: `docs/unified-commerce-os.md` (Brand → Store → Product → Customer → Transaction → Engagement → Retention).

## Run it

```
pnpm install
pnpm dev:admin     # http://localhost:5373
pnpm dev:mobile    # http://localhost:5374
pnpm dev:storefront  # http://localhost:5375/lari, /aruna, /teknika
```

Sign in with any demo account on the login screen; any password works.

| Account | Role | Brands |
|---|---|---|
| Dewi Lestari | Platform admin | all three |
| Andi Pratama | Tenant admin | Lari Running Co., Aruna Beauty |
| Hendra Wijaya | Tenant admin | Teknika Industrial |
| Maya Putri | Marketing | Lari, Aruna |
| Budi Santoso | Commerce operations | all three |
| Sari Wulandari | Customer service | Lari, Aruna |
| Fahmi Rahman, Sherlyn Tan, Rizky Hidayat | Sales agents (phone app) | their brands |

The demo clock starts on Monday 5 October 2026, 09:41 WIB and runs forward. Changes persist in the browser; "Reset demo data" on the phone app or clearing site data restores the seed.

## Workspace

| Path | Contents |
|---|---|
| `packages/types` | domain model: unions with labels and flows, entities |
| `packages/fixtures` | seed loader, reducer store, blockers, permissions, derivations, analytics, journey tests |
| `packages/ui` | WIT component kit and SVG charts |
| `packages/tailwind-config` | design tokens (`theme.css`) |
| `apps/admin` | admin console |
| `apps/mobile` | sales agent PWA |
| `apps/storefront` | shopper storefront per tenant, Theme 1 |
| `scripts` | seeded, deterministic data generator |
| `docs/frontend-conventions.md` | how to add a page |

## Checks

```
pnpm gen:fixtures   # regenerate the seed (deterministic)
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Palette and contrast

WIT red accent on a near-black ink. Tenant storefront colours are data (`Tenant.brand`) and render only inside storefront previews.

| Pair | Ratio | Minimum |
|---|---|---|
| white on ink `#101112` | 18.9 | 4.5 |
| white on accent-strong `#c9141b` | 5.8 | 4.5 |
| on-ink-muted `#b8b8b8` on ink | 9.5 | 4.5 |
| muted `#686868` on surface `#f1f0f1` | 4.9 | 4.5 |
| accent-strong on accent-soft `#fdeced` | 5.1 | 4.5 |
