import type { StorefrontTheme } from '@rc/types'
import { STOREFRONT_THEME_DESCRIPTION, STOREFRONT_THEME_LABEL } from '@rc/types'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from '@rc/ui'
import { ExternalLink } from 'lucide-react'
import { storefrontUrl } from '../../lib/storefront'

const THEMES = Object.keys(STOREFRONT_THEME_LABEL) as StorefrontTheme[]

/** A tiny wireframe of each theme's homepage, so the choice reads at a glance. */
function Thumb({ theme }: { theme: StorefrontTheme }) {
  if (theme === 'theme1') {
    return (
      <div aria-hidden className="space-y-1.5 rounded-2xl p-2.5 bg-surface-2">
        <div className="gap-1.5 flex items-center">
          <span className="h-2 w-6 rounded-full bg-ink/70" />
          <span className="h-2 flex-1 rounded-full bg-card" />
          <span className="h-2 w-4 rounded-full bg-accent/60" />
        </div>
        <div className="gap-1.5 grid grid-cols-[1fr_2.4fr_1fr]">
          <span className="h-10 rounded-lg bg-card" />
          <span className="h-10 rounded-lg bg-accent/20" />
          <span className="h-10 rounded-lg bg-card" />
        </div>
        <div className="gap-1 grid grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className="h-5 rounded-md bg-card" />
          ))}
        </div>
      </div>
    )
  }
  return (
    <div aria-hidden className="space-y-1.5 rounded-2xl p-2.5 bg-surface-2">
      <div className="space-y-1.5 rounded-xl p-1.5 bg-accent/15">
        <span className="h-2.5 block rounded-full bg-accent/60" />
        <div className="gap-1.5 grid grid-cols-2">
          <span className="h-7 rounded-md bg-ink/15" />
          <span className="h-7 rounded-md bg-card" />
        </div>
      </div>
      <div className="gap-1 grid grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <span key={i} className={cn('h-4 rounded-md bg-card', i === 2 && 'ring-1 ring-warning')} />
        ))}
      </div>
    </div>
  )
}

export function ThemeCard({
  value,
  saved,
  subdomain,
  onChange,
  disabled,
}: {
  value: StorefrontTheme
  saved: StorefrontTheme
  subdomain: string
  onChange: (theme: StorefrontTheme) => void
  disabled: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Storefront theme</CardTitle>
        <CardDescription>
          The look of every page shoppers see. Content, brand tokens and templates stay the same when you
          switch.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          role="radiogroup"
          aria-label="Storefront theme"
          className="gap-3 sm:grid-cols-2 grid grid-cols-1"
        >
          {THEMES.map((t) => {
            const active = value === t
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => onChange(t)}
                className={cn(
                  'gap-3 rounded-2xl p-3 flex flex-col text-left transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none disabled:cursor-not-allowed',
                  active ? 'bg-card ring-2 ring-ink' : 'bg-surface-2 hover:bg-surface',
                )}
              >
                <Thumb theme={t} />
                <span>
                  <span className="gap-2 text-sm font-semibold flex flex-wrap items-center">
                    {STOREFRONT_THEME_LABEL[t]}
                    {saved === t && <Badge variant="ink">Live</Badge>}
                  </span>
                  <span className="mt-1 text-xs block text-muted">{STOREFRONT_THEME_DESCRIPTION[t]}</span>
                </span>
              </button>
            )
          })}
        </div>
        <a
          href={storefrontUrl(subdomain)}
          target="_blank"
          rel="noreferrer"
          className="mt-3 gap-1.5 text-xs font-semibold inline-flex items-center hover:text-accent"
        >
          <ExternalLink className="size-3.5" />
          Open the live store
        </a>
      </CardContent>
    </Card>
  )
}
