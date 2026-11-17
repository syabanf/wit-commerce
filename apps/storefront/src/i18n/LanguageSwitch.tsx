import { cn } from '@rc/ui'
import { type Lang, chooseLanguage, t, useLang } from '.'

const LANGS: Lang[] = ['id', 'en']

/** The footer's ID | EN switch. The pick is remembered on this device. */
export function LanguageSwitch({ className }: { className?: string }) {
  const lang = useLang()
  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className={cn('gap-1 text-xs inline-flex items-center', className)}
    >
      {LANGS.map((code, i) => (
        <span key={code} className="gap-1 inline-flex items-center">
          {i > 0 && (
            <span aria-hidden className="opacity-40">
              |
            </span>
          )}
          <button
            type="button"
            lang={code}
            aria-pressed={lang === code}
            aria-label={code === 'id' ? 'Bahasa Indonesia' : 'English'}
            onClick={() => chooseLanguage(code)}
            className={cn(
              'min-h-8 min-w-8 px-1.5 font-semibold tracking-wide rounded-full uppercase',
              lang === code ? 'underline underline-offset-4' : 'opacity-60 hover:opacity-100',
            )}
          >
            {code}
          </button>
        </span>
      ))}
    </div>
  )
}
