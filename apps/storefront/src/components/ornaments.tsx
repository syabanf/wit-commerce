import { cn } from '@rc/ui'
import { type ReactNode, useId } from 'react'

/** A hand-drawn underline that sits under a word or a line of a headline. Inherits the text colour. */
export function Squiggle({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 220 14"
      preserveAspectRatio="none"
      fill="none"
      className={cn('h-3 w-full', className)}
    >
      <path
        d="M2 9.5c18-5 34-6.5 52-3.2 14 2.6 25 4.4 40 1.4C112 4 128 2.6 146 5.4c16 2.5 30 4.6 46 1.6 8-1.5 15-3 26-3.6"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** A headline whose last word carries the hand-drawn underline, however the line wraps. */
export function Underlined({ text }: { text: string }) {
  const cut = text.trimEnd().lastIndexOf(' ')
  return (
    <>
      {text.slice(0, cut + 1)}
      <span className="relative inline-block whitespace-nowrap">
        {text.slice(cut + 1)}
        <Squiggle className="-bottom-2 left-0 absolute text-[color:var(--sf-accent)]" />
      </span>
    </>
  )
}

/** Four-point sparkle, drawn with slightly uneven arms. */
export function Sparkle({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn('size-5', className)} fill="currentColor">
      <path d="M12 1.5c.6 4.6 2.3 8 9.8 10.3-7.3 1.9-9 5.5-9.6 10.7-.8-5.4-2.6-8.6-10.7-10.5C9.4 9.9 11.2 6.5 12 1.5Z" />
    </svg>
  )
}

/** Round rubber-stamp badge: text around the rim, a mark in the middle, set at a slight angle. */
export function Stamp({
  text,
  className,
  children,
}: {
  text: string
  className?: string
  children?: ReactNode
}) {
  const id = useId()
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-28 relative inline-flex -rotate-12 items-center justify-center rounded-full bg-[var(--sf-accent)] text-[color:var(--sf-on-accent)] shadow-float',
        className,
      )}
    >
      <svg viewBox="0 0 100 100" className="inset-0 absolute size-full">
        <defs>
          <path id={id} d="M50 50m-37 0a37 37 0 1 1 74 0a37 37 0 1 1 -74 0" />
        </defs>
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.8"
          strokeDasharray="2 2.4"
        />
        <text fontSize="9.5" fontWeight="700" letterSpacing="2.2" fill="currentColor">
          <textPath href={`#${id}`}>{text.toUpperCase()}</textPath>
        </text>
      </svg>
      <span className="relative">{children ?? <Sparkle className="size-7" />}</span>
    </span>
  )
}

/** A tilted paper label, like a note a shop assistant sticks on a shelf. */
export function Sticker({
  children,
  tilt = 'left',
  className,
}: {
  children: ReactNode
  tilt?: 'left' | 'right'
  className?: string
}) {
  return (
    <span
      className={cn(
        'px-3 py-1.5 text-xs font-bold rounded-md inline-block bg-[var(--sf-bg)] text-[color:var(--sf-text)] shadow-float',
        tilt === 'left' ? '-rotate-3' : 'rotate-2',
        className,
      )}
    >
      {children}
    </span>
  )
}
