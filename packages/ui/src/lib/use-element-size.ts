import { useCallback, useRef, useState } from 'react'

type Size = { width: number; height: number }

/** Tracks an element's content-box size with a ResizeObserver. Both values are 0 until the first measure. */
export function useElementSize<T extends HTMLElement>(): readonly [(el: T | null) => void, Size] {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const observer = useRef<ResizeObserver | null>(null)

  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    })
    ro.observe(el)
    observer.current = ro
  }, [])

  return [ref, size] as const
}
