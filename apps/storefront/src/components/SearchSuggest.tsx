import type { ShopSuggestResult } from '@rc/api'
import { cn } from '@rc/ui'
import { LayoutGrid, Search } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useId, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../i18n'
import { HTTP, api } from '../lib/api'
import { paths } from '../lib/paths'
import { localSuggest } from '../lib/search'
import { useShop } from '../state/shop'
import { Money } from './Money'
import { ProductImage } from './product'

const DEBOUNCE_MS = 200
const EMPTY: ShopSuggestResult = { products: [], categories: [] }

/** Suggestions for what a shopper has typed, asked once they pause. Without an API, from the bundled catalog. */
function useSuggestions(q: string): ShopSuggestResult {
  const { catalog, store } = useShop()
  const [answer, setAnswer] = useState<{ q: string; result: ShopSuggestResult } | null>(null)
  const query = q.trim()
  useEffect(() => {
    if (query.length < 2) return
    let live = true
    const timer = setTimeout(() => {
      const ask = HTTP ? api.shop.suggest(store, query) : Promise.resolve(localSuggest(catalog, query))
      // A suggestion that fails is no worse than none; the shopper can still submit the search.
      ask.then((result) => live && setAnswer({ q: query, result })).catch(() => undefined)
    }, DEBOUNCE_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query, store, catalog])
  return query.length >= 2 && answer?.q === query ? answer.result : EMPTY
}

interface Option {
  key: string
  to: string
  node: ReactNode
}

/**
 * A search field that suggests products and categories as the shopper types. Arrow keys move through
 * them, Enter opens the highlighted one, and Enter with none highlighted submits the form around it.
 * The form must be `relative`: the list opens under it.
 */
export function SuggestInput({
  id,
  value,
  onChange,
  placeholder,
  className,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
}) {
  const { store } = useShop()
  const navigate = useNavigate()
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const { products, categories } = useSuggestions(value)
  const options: Option[] = [
    ...products.map((p) => ({
      key: `p-${p.id}`,
      to: paths.product(store, p.id),
      node: (
        <>
          <ProductImage product={p} size="sm" className="size-10 shrink-0 rounded-lg" />
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
          <Money idr={p.price} className="text-xs shrink-0 text-[color:var(--sf-muted)]" />
        </>
      ),
    })),
    ...categories.map((c) => ({
      key: `c-${c.id}`,
      to: paths.category(store, c.id),
      node: (
        <>
          <span className="size-10 flex shrink-0 items-center justify-center rounded-lg bg-[var(--sf-soft)]">
            <LayoutGrid className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate">{c.name}</span>
        </>
      ),
    })),
  ]
  const shown = open && options.length > 0
  const pick = (o: Option) => {
    setOpen(false)
    navigate(o.to)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!shown) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      // -1 is the field itself: moving past either end comes back to it.
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => {
        const next = i + step
        if (next >= options.length) return -1
        return next < -1 ? options.length - 1 : next
      })
    } else if (e.key === 'Enter' && active >= 0 && active < options.length) {
      e.preventDefault()
      pick(options[active])
    }
  }
  const group = (label: string, list: Option[], offset: number) =>
    list.length > 0 && (
      <li role="presentation">
        <p className="px-3 pt-2 pb-1 text-xs font-bold uppercase tracking-wide text-[color:var(--sf-muted)]">{label}</p>
        <ul role="group" aria-label={label}>
          {list.map((o, i) => (
            <li
              key={o.key}
              id={`${listId}-${offset + i}`}
              role="option"
              aria-selected={active === offset + i}
            >
              <Link
                to={o.to}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setOpen(false)}
                className={cn(
                  'min-h-11 gap-3 px-3 py-1.5 text-sm flex items-center rounded-xl',
                  active === offset + i ? 'bg-[var(--sf-soft)]' : 'hover:bg-[var(--sf-soft)]',
                )}
              >
                {o.node}
              </Link>
            </li>
          ))}
        </ul>
      </li>
    )
  return (
    <>
      <input
        id={id}
        type="search"
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setActive(-1)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={className}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={t('catalog.suggest.label')}
        hidden={!shown}
        className="inset-x-0 top-full mt-2 p-1.5 absolute z-50 max-h-[70dvh] overflow-y-auto rounded-2xl border border-[color:var(--sf-line)] bg-[var(--sf-bg)] text-[color:var(--sf-text)] shadow-float"
      >
        {group(t('catalog.suggest.products'), options.slice(0, products.length), 0)}
        {group(t('catalog.suggest.categories'), options.slice(products.length), products.length)}
        <li role="presentation" className="mt-1 border-t border-[color:var(--sf-line)] pt-1">
          <Link
            to={paths.search(store, value.trim())}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(false)}
            className="min-h-11 gap-3 px-3 text-sm font-semibold flex items-center rounded-xl hover:bg-[var(--sf-soft)]"
          >
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">{t('catalog.suggest.all', { query: value.trim() })}</span>
          </Link>
        </li>
      </ul>
    </>
  )
}
