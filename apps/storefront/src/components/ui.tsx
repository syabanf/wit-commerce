import { cn } from '@rc/ui'
import { Minus, Plus } from 'lucide-react'
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react'
import { Link } from 'react-router'

// Theme-neutral controls. Colours and corners come from the --sf-* variables the theme and brand set,
// so the same control reads as a pill in Theme 1 and a hairline rectangle on a Theme 2 phone.

export type ButtonVariant = 'primary' | 'dark' | 'outline' | 'light' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'border-2 border-[color:var(--sf-primary)] bg-[var(--sf-btn-bg)] text-[color:var(--sf-btn-fg)] rounded-[var(--sf-cta-radius)] hover:brightness-95',
  dark: 'border-2 border-[color:var(--sf-text)] bg-[var(--sf-text)] text-[color:var(--sf-bg)] rounded-[var(--sf-pill)] hover:opacity-90',
  outline:
    'border border-[color:var(--sf-line)] bg-transparent text-[color:var(--sf-text)] rounded-[var(--sf-pill)] hover:border-[color:var(--sf-text)]',
  light:
    'border border-transparent bg-[var(--sf-bg)] text-[color:var(--sf-text)] rounded-[var(--sf-pill)] hover:opacity-90',
  ghost: 'text-[color:var(--sf-text)] underline underline-offset-4 hover:opacity-80',
}
const SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-4 text-xs',
  md: 'min-h-11 px-5 text-sm',
  lg: 'min-h-12 px-6 text-base',
}

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', full = false) {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
    VARIANT[variant],
    variant === 'ghost' ? 'min-h-11 px-1 text-sm' : SIZE[size],
    full && 'w-full',
  )
}

interface ButtonOwnProps {
  variant?: ButtonVariant
  size?: ButtonSize
  full?: boolean
}

export function Button({
  variant,
  size,
  full,
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & ButtonOwnProps) {
  return <button type={type} className={cn(buttonClass(variant, size, full), className)} {...props} />
}

export function ButtonLink({
  variant,
  size,
  full,
  className,
  ...props
}: ComponentProps<typeof Link> & ButtonOwnProps) {
  return <Link className={cn(buttonClass(variant, size, full), className)} {...props} />
}

/** A 44px round icon button; `label` is its accessible name. */
export function IconButton({
  label,
  className,
  tone = 'plain',
  type = 'button',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  tone?: 'plain' | 'dark' | 'light' | 'outline'
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'size-11 [&_svg]:size-5 inline-flex shrink-0 items-center justify-center rounded-full transition disabled:opacity-40',
        tone === 'dark' && 'bg-[var(--sf-text)] text-[color:var(--sf-bg)]',
        tone === 'light' && 'bg-[var(--sf-bg)] text-[color:var(--sf-text)]',
        tone === 'outline' &&
          'border border-[color:var(--sf-line)] bg-[var(--sf-bg)] text-[color:var(--sf-text)]',
        tone === 'plain' && 'text-[color:var(--sf-text)] hover:bg-[var(--sf-soft)]',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

// --- form fields ---

export const inputClass =
  'h-12 w-full min-w-0 rounded-[var(--sf-tile-radius)] border border-[color:var(--sf-line)] bg-[var(--sf-bg)] px-4 text-sm text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-muted)] aria-[invalid=true]:border-danger'

export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string
  label: string
  hint?: string
  error?: string | null
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="mb-1.5 text-sm font-semibold block">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-[color:var(--sf-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** Props that tie a control to its Field's error or hint text. */
export const describedBy = (id: string, error?: string | null, hint?: string) => ({
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
})

// --- small pieces ---

export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  label = 'Quantity',
  className,
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  label?: string
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('gap-1 inline-flex items-center', className)}>
      <IconButton
        label="Decrease quantity"
        tone="outline"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus aria-hidden="true" />
      </IconButton>
      <output aria-live="polite" className="w-9 text-base font-bold text-center tabular-nums">
        {value}
      </output>
      <IconButton
        label="Increase quantity"
        tone="outline"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus aria-hidden="true" />
      </IconButton>
    </div>
  )
}

export function Pill({
  tone = 'soft',
  className,
  children,
}: {
  tone?: 'accent' | 'dark' | 'soft' | 'primary' | 'light'
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'gap-1 px-2.5 py-1 font-bold inline-flex items-center rounded-full text-[11px] leading-none whitespace-nowrap',
        tone === 'accent' && 'bg-[var(--sf-accent)] text-[color:var(--sf-on-accent)]',
        tone === 'dark' && 'bg-[var(--sf-text)] text-[color:var(--sf-bg)]',
        tone === 'primary' && 'bg-[var(--sf-primary)] text-[color:var(--sf-on-primary)]',
        tone === 'soft' && 'bg-[var(--sf-soft)] text-[color:var(--sf-text)]',
        tone === 'light' && 'bg-[var(--sf-bg)] text-[color:var(--sf-text)]',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  text,
  action,
  className,
}: {
  icon: ReactNode
  title: string
  text: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('sf-card px-6 py-12 flex flex-col items-center text-center', className)}>
      <span className="size-14 [&_svg]:size-6 flex items-center justify-center rounded-full bg-[var(--sf-soft)]">
        {icon}
      </span>
      <h2 className="sf-display mt-4 text-xl font-bold">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-[color:var(--sf-muted)]">{text}</p>
      {action && <div className="mt-5 gap-2 flex flex-wrap justify-center">{action}</div>}
    </div>
  )
}

/** Horizontal row that scrolls inside its own box, so the page never scrolls sideways. */
export function Scroller({
  className,
  children,
  label,
}: {
  className?: string
  children: ReactNode
  label?: string
}) {
  return (
    <div
      role={label ? 'region' : undefined}
      aria-label={label}
      className={cn('min-w-0 gap-3 pb-1 -mx-px no-scrollbar flex snap-x overflow-x-auto px-px', className)}
    >
      {children}
    </div>
  )
}
