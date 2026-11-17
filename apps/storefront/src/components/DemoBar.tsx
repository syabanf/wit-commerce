import type { StorefrontTheme } from '@rc/types'
import { LayoutGrid, Palette } from 'lucide-react'
import { Link } from 'react-router'
import { HOST_STORE } from '../lib/host'
import { paths } from '../lib/paths'
import { useShop } from '../state/shop'
import { THEMES, themeLabel, themeShortName, useThemeChoice } from '../themes/registry'
import { t } from '../i18n'

/** Demo chrome, outside the tenant brand: which theme is on screen and a switch to the other one. */
export function DemoBar() {
  const { tenant } = useShop()
  const { theme, preview, setPreview } = useThemeChoice()
  const other = (Object.keys(THEMES) as StorefrontTheme[]).find((t) => t !== theme.id)!
  const pill =
    'inline-flex min-h-10 md:min-h-8 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60'
  return (
    <div className="px-4 py-1.5 md:px-6 lg:px-10 bg-ink text-on-ink">
      <div className="gap-3 flex items-center justify-between">
        <p className="min-w-0 text-xs truncate text-on-ink-muted">
          <span className="font-semibold text-white">{t('shell.demo')}</span> ·{' '}
          {t('shell.demo.inTheme', { store: tenant.name, theme: themeLabel(theme.id) })}
          {preview ? ` (${t('shell.demo.preview')})` : ''}
        </p>
        <div className="gap-1.5 flex shrink-0">
          <button
            type="button"
            className={pill}
            onClick={() => setPreview(other === tenant.brand.theme ? null : other)}
          >
            <Palette className="size-3.5" aria-hidden="true" />
            <span className="sm:inline hidden">{t('shell.demo.viewIn')}</span> {themeShortName(other)}
          </button>
          {!HOST_STORE && (
            <Link to={paths.chooser()} className={pill}>
              <LayoutGrid className="size-3.5" aria-hidden="true" />
              <span className="sm:hidden">{t('shell.demo.demos')}</span>
              <span className="sm:inline hidden">{t('shell.demo.all')}</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
