import { SearchX } from 'lucide-react'
import { paths } from '../lib/paths'
import { useShop } from '../state/shop'
import { ButtonLink } from './ui'
import { t } from '../i18n'

/** Friendly not-found page inside a store, in the store's brand. */
export function NotFound({ title = t('shell.notFound.title'), text }: { title?: string; text?: string }) {
  const { store } = useShop()
  return (
    <div className="sf-card max-w-xl px-6 py-14 mx-auto flex flex-col items-center text-center">
      <span className="size-14 flex items-center justify-center rounded-full bg-[var(--sf-soft)]">
        <SearchX className="size-6" aria-hidden="true" />
      </span>
      <h1 className="sf-display mt-4 text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-[color:var(--sf-muted)]">
        {text ?? t('shell.notFound.text')}
      </p>
      <div className="mt-6 gap-2 flex flex-wrap justify-center">
        <ButtonLink to={paths.home(store)}>{t('shell.notFound.home')}</ButtonLink>
        <ButtonLink to={paths.search(store)} variant="outline">
          {t('shell.notFound.browse')}
        </ButtonLink>
      </div>
    </div>
  )
}
