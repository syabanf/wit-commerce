import { cn } from '@rc/ui'
import { type CSSProperties, type ReactNode, useEffect, useRef } from 'react'

/**
 * Fades and lifts its content in the first time it scrolls into view. Pass `delay` (ms) to stagger a
 * list. Without IntersectionObserver, or under reduced motion (see site.css), the content shows at once.
 */
export function Reveal({
  as: Tag = 'div',
  delay = 0,
  className,
  children,
}: {
  as?: 'div' | 'li' | 'section'
  delay?: number
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!('IntersectionObserver' in window)) {
      el.dataset.shown = ''
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.dataset.shown = ''
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag
      ref={ref as never}
      className={cn('reveal', className)}
      style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  )
}
