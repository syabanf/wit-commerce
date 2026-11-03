import { gsap } from 'gsap'
import { type ReactNode, useCallback, useLayoutEffect, useRef } from 'react'
import { countTo, enter, magnetic, prefersReducedMotion } from '../lib/motion'

/**
 * Plays the page entrance for its children once, when it mounts. Key it by pathname so each page enters,
 * and keep it inside the Suspense boundary so it mounts with the loaded page.
 */
export function Entrance({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || prefersReducedMotion()) return
    const ctx = gsap.context(() => enter(root), root)
    return () => ctx.revert()
  }, [])
  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  )
}

/** A number that counts from its previous value to the new one. */
export function CountUp({
  value,
  format = (v) => String(Math.round(v)),
}: {
  value: number
  format?: (value: number) => string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    if (ref.current) countTo(ref.current, value, format)
    // format is usually an inline function; only a new value should restart the count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return <span ref={ref}>{format(value)}</span>
}

/** A callback ref that makes the element follow a fine pointer while `enabled`. */
export function useMagnetic(enabled: boolean) {
  return useCallback((el: HTMLElement | null) => (enabled && el ? magnetic(el) : undefined), [enabled])
}
