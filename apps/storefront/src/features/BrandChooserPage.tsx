import type { StorefrontTheme, Tenant } from '@rc/types'
import { cn } from '@rc/ui'
import {
  ArrowRight,
  Bot,
  Handshake,
  Layers,
  type LucideIcon,
  Palette,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Store,
} from 'lucide-react'
import { Link } from 'react-router'
import { BrandLogo } from '../components/BrandLogo'
import { brandVars } from '../lib/brand'
import { paths } from '../lib/paths'
import { useTitle } from '../lib/useTitle'
import { useStore } from '../state/store'
import { HTTP } from '../lib/api'
import { THEMES, themeDescription, themeLabel, themeShortName } from '../themes/registry'
import { type MessageKey, t } from '../i18n'

const THEME_IDS = Object.keys(THEMES) as StorefrontTheme[]

/** Flows worth trying, each a deep link into one of the demo stores. */
const FLOWS: { icon: LucideIcon; title: MessageKey; text: MessageKey; to: string }[] = [
  {
    icon: SlidersHorizontal,
    title: 'shell.flow.filters',
    text: 'shell.flow.filters.text',
    to: '/lari/c/cat-lari-road',
  },
  {
    icon: Layers,
    title: 'shell.flow.variants',
    text: 'shell.flow.variants.text',
    to: '/lari/p/prd-lr-102',
  },
  {
    icon: ShoppingCart,
    title: 'shell.flow.bxgy',
    text: 'shell.flow.bxgy.text',
    to: '/lari/p/prd-lr-115',
  },
  {
    icon: ShoppingBag,
    title: 'shell.flow.checkout',
    text: 'shell.flow.checkout.text',
    to: '/lari/checkout',
  },
  {
    icon: Store,
    title: 'shell.flow.personal',
    text: 'shell.flow.personal.text',
    to: '/lari/fahmi',
  },
  {
    icon: Sparkles,
    title: 'shell.flow.agentic',
    text: 'shell.flow.agentic.text',
    to: '/lari/agent',
  },
  {
    icon: Bot,
    title: 'shell.flow.assistant',
    text: 'shell.flow.assistant.text',
    to: '/aruna',
  },
  {
    icon: Palette,
    title: 'shell.flow.editorial',
    text: 'shell.flow.editorial.text',
    to: '/aruna/collections/sensitive-skin',
  },
  {
    icon: Handshake,
    title: 'shell.flow.sales',
    text: 'shell.flow.sales.text',
    to: '/teknika/p/prd-tk-101',
  },
]

/** A tiny homepage wireframe per theme, drawn in the platform's neutral tokens. */
function Wireframe({ theme }: { theme: StorefrontTheme }) {
  if (theme === 'theme1') {
    return (
      <div aria-hidden="true" className="space-y-2 rounded-2xl p-3 bg-surface-2">
        <div className="gap-2 flex items-center">
          <span className="h-3 w-10 rounded-full bg-ink/70" />
          <span className="h-3 flex-1 rounded-full bg-card" />
          <span className="h-3 w-8 rounded-full bg-accent/60" />
        </div>
        <div className="gap-2 grid grid-cols-[1fr_2.6fr_1fr]">
          <span className="h-20 rounded-xl bg-card" />
          <span className="h-20 rounded-xl bg-accent/20" />
          <span className="gap-2 grid">
            <span className="rounded-xl bg-warning/30" />
            <span className="rounded-xl bg-accent/50" />
          </span>
        </div>
        <div className="gap-1.5 grid grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={cn('h-8 rounded-lg', i % 2 ? 'bg-card' : 'bg-accent/30')} />
          ))}
        </div>
      </div>
    )
  }
  return (
    <div aria-hidden="true" className="space-y-2 rounded-2xl p-3 bg-surface-2">
      <div className="space-y-2 rounded-xl p-2 bg-info/15">
        <span className="h-3 block rounded-full bg-info/60" />
        <div className="gap-2 grid grid-cols-[1.2fr_1fr]">
          <span className="gap-1.5 grid content-center">
            <span className="h-3 w-4/5 rounded-full bg-ink/70" />
            <span className="h-3 w-3/5 rounded-full bg-ink/40" />
            <span className="mt-1 h-4 w-1/3 rounded-full bg-info/60" />
          </span>
          <span className="h-16 rounded-lg bg-card" />
        </div>
      </div>
      <div className="gap-1.5 grid grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <span key={i} className={cn('h-8 rounded-lg bg-card', i === 1 && 'ring-2 ring-warning')} />
        ))}
      </div>
    </div>
  )
}

const otherTheme = (t: Tenant): StorefrontTheme => THEME_IDS.find((id) => id !== t.brand.theme) ?? 'theme1'

/** `/`: the demo hub. Both themes, every demo store, and the flows worth trying. */
export function BrandChooserPage() {
  const { state } = useStore()
  useTitle(t('shell.hub.pageTitle'))
  const tenants = HTTP
    ? state.tenants
    : state.tenants.filter((x) =>
        state.pages.some((p) => p.tenantId === x.id && p.kind === 'home' && p.status === 'published'),
      )
  const using = (theme: StorefrontTheme) => tenants.filter((x) => x.brand.theme === theme)

  return (
    <main className="px-4 py-10 md:px-6 md:py-16 lg:px-10 min-h-dvh bg-surface">
      <div className="max-w-6xl space-y-12 mx-auto">
        <header>
          <p className="font-semibold tracking-wider text-[11px] text-muted uppercase">
            {t('shell.hub.kicker')}
          </p>
          <h1 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight md:text-5xl">
            {t('shell.hub.title')}
            <span className="text-accent">.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-muted">
            {t('shell.hub.text')}
          </p>
        </header>

        <section aria-labelledby="themes-h">
          <h2 id="themes-h" className="text-xl font-bold">
            {t('shell.hub.themes')}
          </h2>
          <ul className="mt-4 gap-4 md:grid-cols-2 grid grid-cols-1">
            {THEME_IDS.map((theme) => {
              const live = using(theme)
              const lead = live[0] ?? tenants[0]!
              return (
                <li key={theme} className="p-5 flex flex-col rounded-card bg-card shadow-card">
                  <Wireframe theme={theme} />
                  <h3 className="mt-5 text-2xl font-bold tracking-tight">{themeLabel(theme)}</h3>
                  <p className="mt-1 text-sm text-muted">{themeDescription(theme)}</p>
                  <p className="mt-4 text-xs font-semibold text-muted">
                    {t('shell.hub.liveOn', {
                      stores: live.length ? live.map((x) => x.name).join(', ') : t('shell.hub.noStore'),
                    })}
                  </p>
                  <div className="pt-5 mt-auto">
                    <Link
                      to={
                        live.length
                          ? paths.home(lead.subdomain)
                          : `${paths.home(lead.subdomain)}?theme=${theme}`
                      }
                      className="h-11 gap-2 px-5 text-sm font-semibold text-white sm:w-auto sm:inline-flex flex w-full items-center justify-center rounded-full bg-accent-strong shadow-glow hover:bg-accent-dark"
                    >
                      {t('shell.hub.open', { name: lead.name })}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                    <p className="mt-3 gap-x-4 text-sm flex flex-wrap items-center text-muted">
                      <span>{t('shell.hub.alsoTry')}</span>
                      {tenants
                        .filter((other) => other.brand.theme !== theme)
                        .map((other) => (
                          <Link
                            key={other.id}
                            to={`${paths.home(other.subdomain)}?theme=${theme}`}
                            className="min-h-11 font-semibold inline-flex items-center text-foreground underline-offset-4 hover:underline"
                          >
                            {other.name}
                          </Link>
                        ))}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <section aria-labelledby="stores-h">
          <h2 id="stores-h" className="text-xl font-bold">
            {t('shell.hub.stores')}
          </h2>
          <ul className="mt-4 gap-4 md:grid-cols-3 grid grid-cols-1">
            {tenants.map((tenant) => (
              <li key={tenant.id} className="p-5 flex flex-col rounded-card bg-card shadow-card">
                <div style={brandVars(tenant.brand)} className="text-[color:var(--sf-text)]">
                  <BrandLogo tenant={tenant} />
                </div>
                <div className="mt-4 gap-1.5 flex" aria-hidden="true">
                  {Object.values(tenant.brand.colors).map((c, i) => (
                    <span
                      key={i}
                      className="size-7 rounded-full border border-border"
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <h3 className="mt-4 text-xl font-bold">{tenant.name}</h3>
                <p className="mt-1 text-sm flex-1 text-muted">{tenant.brand.tagline}</p>
                <p className="mt-4 text-xs font-semibold text-muted">
                  {themeLabel(tenant.brand.theme)}
                </p>
                <div className="mt-3 gap-2 flex flex-wrap">
                  <Link
                    to={paths.home(tenant.subdomain)}
                    className="h-10 gap-1.5 px-4 text-sm font-semibold inline-flex items-center rounded-full bg-ink text-on-ink hover:bg-ink-3"
                  >
                    {t('shell.hub.visit')}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                  <Link
                    to={`${paths.home(tenant.subdomain)}?theme=${otherTheme(tenant)}`}
                    className="h-10 px-4 text-sm font-semibold inline-flex items-center rounded-full border border-border hover:bg-surface"
                  >
                    {t('shell.demo.viewIn')} {themeShortName(otherTheme(tenant))}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="flows-h">
          <h2 id="flows-h" className="text-xl font-bold">
            {t('shell.hub.flows')}
          </h2>
          <ul className="mt-4 gap-3 sm:grid-cols-2 lg:grid-cols-4 grid grid-cols-1">
            {FLOWS.map(({ icon: Icon, title, text, to }) => (
              <li key={to}>
                <Link
                  to={to}
                  className="gap-3 rounded-2xl p-4 flex h-full items-start bg-card shadow-card transition-colors hover:bg-surface-2"
                >
                  <span className="size-10 rounded-xl flex shrink-0 items-center justify-center bg-surface text-body">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="text-sm font-semibold block">{t(title)}</span>
                    <span className="mt-0.5 text-xs block text-muted">{t(text)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}
