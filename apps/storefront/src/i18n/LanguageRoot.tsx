import { type ReactNode, useEffect } from 'react'
import { useLang } from '.'

/**
 * Keeps `<html lang>` in step with the language, for screen readers and the browser's own translation
 * offer. Each route renders again when the language changes (router.tsx), so pages keep their state.
 */
export function LanguageRoot({ children }: { children: ReactNode }) {
  const lang = useLang()
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  return children
}
