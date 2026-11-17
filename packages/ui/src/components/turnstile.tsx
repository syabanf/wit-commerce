import { useEffect, useRef } from 'react'
import { cn } from '../lib/cn'

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
      theme?: 'auto' | 'light' | 'dark'
    },
  ) => string
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let loading: Promise<TurnstileApi> | null = null

/** Loads Cloudflare's script once per page. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('no turnstile')))
    script.onerror = () => {
      loading = null
      reject(new Error('turnstile did not load'))
    }
    document.head.appendChild(script)
  })
  return loading
}

export type TurnstileProps = {
  siteKey: string
  /** The token, or '' once it expires or the check fails. */
  onToken: (token: string) => void
  className?: string
}

/** Cloudflare Turnstile: the check that a person, not a bot, fills the form. */
export function Turnstile({ siteKey, onToken, className }: TurnstileProps) {
  const box = useRef<HTMLDivElement>(null)
  const report = useRef(onToken)
  report.current = onToken

  useEffect(() => {
    let id: string | null = null
    let cancelled = false
    loadTurnstile()
      .then((api) => {
        if (cancelled || !box.current) return
        id = api.render(box.current, {
          sitekey: siteKey,
          theme: 'auto',
          callback: (token) => report.current(token),
          'expired-callback': () => report.current(''),
          'error-callback': () => report.current(''),
        })
      })
      .catch(() => report.current(''))
    return () => {
      cancelled = true
      if (id) window.turnstile?.remove(id)
    }
  }, [siteKey])

  return <div ref={box} className={cn('min-h-[4.0625rem]', className)} />
}
