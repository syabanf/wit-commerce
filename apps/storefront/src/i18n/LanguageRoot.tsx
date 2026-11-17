import { Fragment, type ReactNode, useEffect } from 'react'
import { useLang } from '.'

/**
 * Re-mounts the app when the language changes, so every text read at render time follows it, and keeps
 * `<html lang>` in step for screen readers and the browser's own translation offer.
 */
export function LanguageRoot({ children }: { children: ReactNode }) {
  const lang = useLang()
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  return <Fragment key={lang}>{children}</Fragment>
}
