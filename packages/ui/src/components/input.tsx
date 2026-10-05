import type { ComponentProps, ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../lib/cn'
import { useFieldControl } from './form-field'

export const inputVariants = cva(
  'h-11 w-full min-w-0 px-4 text-base text-foreground md:text-sm transition-colors placeholder:text-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      variant: {
        default:
          'rounded-2xl border border-border bg-card focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:bg-surface',
        soft: 'rounded-2xl border-0 bg-surface focus:ring-2 focus:ring-accent/20',
        pill: 'rounded-full border-0 bg-card shadow-card focus:ring-2 focus:ring-accent/20',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

/** Error styling shared by inputs, textareas and select triggers. */
export function invalidClass(variant: string): string {
  return variant === 'default' ? 'border-danger focus:border-danger' : 'ring-2 ring-danger/25'
}

export type InputProps = ComponentProps<'input'> & {
  leftIcon?: ReactNode
  rightSlot?: ReactNode
  invalid?: boolean
  variant?: 'default' | 'soft' | 'pill'
  /** Classes for the `<input>` itself; `className` styles the wrapper. */
  inputClassName?: string
}

export function Input({
  leftIcon,
  rightSlot,
  invalid = false,
  variant = 'default',
  className,
  inputClassName,
  id,
  'aria-describedby': describedBy,
  ...props
}: InputProps) {
  const field = useFieldControl(id, describedBy)
  const isInvalid = invalid || field.invalid
  return (
    <div className={cn('relative w-full', className)}>
      {leftIcon !== undefined && (
        <span className="left-3.5 [&_svg]:size-4 pointer-events-none absolute top-1/2 flex -translate-y-1/2 text-muted">
          {leftIcon}
        </span>
      )}
      <input
        id={field.id}
        aria-describedby={field.describedBy}
        aria-invalid={isInvalid || undefined}
        className={cn(
          inputVariants({ variant }),
          leftIcon !== undefined && 'pl-10',
          rightSlot !== undefined && 'pr-11',
          isInvalid && invalidClass(variant),
          inputClassName,
        )}
        {...props}
      />
      {rightSlot !== undefined && (
        <span className="right-2 [&_svg]:size-4 absolute top-1/2 flex -translate-y-1/2 items-center text-muted">
          {rightSlot}
        </span>
      )}
    </div>
  )
}
