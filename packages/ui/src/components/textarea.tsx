import type { ComponentProps } from 'react'
import { cn } from '../lib/cn'
import { useFieldControl } from './form-field'
import { invalidClass } from './input'

export type TextareaProps = ComponentProps<'textarea'> & { invalid?: boolean; variant?: 'default' | 'soft' }

export function Textarea({
  invalid = false,
  variant = 'default',
  className,
  id,
  'aria-describedby': describedBy,
  ...props
}: TextareaProps) {
  const field = useFieldControl(id, describedBy)
  const isInvalid = invalid || field.invalid
  return (
    <textarea
      id={field.id}
      aria-describedby={field.describedBy}
      aria-invalid={isInvalid || undefined}
      className={cn(
        'min-h-28 min-w-0 rounded-2xl px-4 py-3 text-base md:text-sm w-full text-foreground transition-colors placeholder:text-muted focus:ring-2 focus:ring-accent/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'default'
          ? 'border border-border bg-card focus:border-accent disabled:bg-surface'
          : 'border-0 bg-surface',
        isInvalid && invalidClass(variant),
        className,
      )}
      {...props}
    />
  )
}
