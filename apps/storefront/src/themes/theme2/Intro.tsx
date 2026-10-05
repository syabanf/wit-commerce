import { categoryPhoto } from '@rc/fixtures'
import { cn } from '@rc/ui'
import { Link } from 'react-router'
import { Photo } from '../../components/product'
import { Button } from '../../components/ui'
import { tint } from '../../lib/brand'
import { popularCategories } from '../../lib/catalog'
import { paths } from '../../lib/paths'
import { useTitle } from '../../lib/useTitle'
import { useShop } from '../../state/shop'

const BUBBLES = ['size-32', 'size-24 mt-10', 'size-28', 'size-36 -mt-4', 'size-24', 'size-28 mt-6']
const BUBBLE_SIZE = [32, 24, 28, 36, 24, 28]

/** First visit on a phone: category photo bubbles, one line, and Get started. Dismissal is remembered per tenant. */
export function Intro({ onDone }: { onDone: () => void }) {
  const { tenant, catalog, store } = useShop()
  useTitle(tenant.name)
  const popular = popularCategories(catalog).slice(0, BUBBLES.length)
  // Longest names get the biggest bubbles; a label that still does not fit wraps to a second line.
  const bySize = popular.map((_, i) => i).sort((a, b) => BUBBLE_SIZE[b]! - BUBBLE_SIZE[a]!)
  const byLength = [...popular].sort((a, b) => b.name.length - a.name.length)
  const categories = popular.map((_, slot) => byLength[bySize.indexOf(slot)]!)
  return (
    <main className="px-5 pt-10 pb-8 flex min-h-dvh flex-col" style={{ background: tint('--sf-primary', 8) }}>
      <p className="sf-serif text-sm font-bold text-center tracking-[0.2em] uppercase">{tenant.name}</p>
      <ul className="gap-3 py-8 my-auto flex flex-wrap items-start justify-center" aria-label="Categories">
        {categories.map((c, i) => (
          <li key={c.id}>
            <Link
              to={paths.category(store, c.id)}
              onClick={onDone}
              className={cn(
                'p-2 relative flex items-center justify-center overflow-hidden rounded-full text-center shadow-card',
                BUBBLES[i],
              )}
            >
              <Photo id={categoryPhoto(c.id)} width={240} className="inset-0 absolute" />
              <span className="px-2 py-1 leading-tight font-semibold relative line-clamp-2 max-w-full rounded-full bg-[var(--sf-bg)] text-[11px] text-balance">
                {c.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <h1 className="sf-serif text-3xl leading-tight text-center">
        Bringing you the products our members love
      </h1>
      <p className="mt-3 text-sm text-center text-[color:var(--sf-muted)]">{tenant.brand.tagline}</p>
      <Button variant="dark" size="lg" full onClick={onDone} className="mt-8 rounded-full">
        Get started
      </Button>
    </main>
  )
}
