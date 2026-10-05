import { SearchX } from 'lucide-react'
import { paths } from '../lib/paths'
import { useShop } from '../state/shop'
import { ButtonLink } from './ui'

/** Friendly not-found page inside a store, in the store's brand. */
export function NotFound({ title = 'We could not find that page', text }: { title?: string; text?: string }) {
  const { store } = useShop()
  return (
    <div className="sf-card max-w-xl px-6 py-14 mx-auto flex flex-col items-center text-center">
      <span className="size-14 flex items-center justify-center rounded-full bg-[var(--sf-soft)]">
        <SearchX className="size-6" aria-hidden="true" />
      </span>
      <h1 className="sf-display mt-4 text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-[color:var(--sf-muted)]">
        {text ??
          'The link may be old, or the item is no longer on sale. Search the store or start from the home page.'}
      </p>
      <div className="mt-6 gap-2 flex flex-wrap justify-center">
        <ButtonLink to={paths.home(store)}>Go to the home page</ButtonLink>
        <ButtonLink to={paths.search(store)} variant="outline">
          Browse all products
        </ButtonLink>
      </div>
    </div>
  )
}
