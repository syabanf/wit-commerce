import type { ComponentProps } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../lib/cn'
import { useFieldControl } from './form-field'
import { invalidClass } from './input'

const variantClasses = {
  default:
    'h-11 w-full rounded-2xl border border-border bg-card pl-4 pr-10 focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:bg-surface',
  soft: 'h-11 w-full rounded-2xl border-0 bg-surface pl-4 pr-10 focus:ring-2 focus:ring-accent/20',
  inline:
    'h-8 rounded-full bg-transparent pl-3 pr-8 font-medium hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-accent/40',
} as const

export type NativeSelectProps = ComponentProps<'select'> & {
  options: { value: string; label: string }[]
  placeholder?: string
  variant?: 'default' | 'soft' | 'inline'
  invalid?: boolean
}

/** Plain `<select>` for fixed enums of 6 or fewer values. Data-backed lists use Combobox. */
export function NativeSelect({
  options,
  placeholder,
  variant = 'default',
  invalid = false,
  className,
  id,
  'aria-describedby': describedBy,
  ...props
}: NativeSelectProps) {
  const field = useFieldControl(id, describedBy)
  const isInvalid = invalid || field.invalid
  return (
    <div className={cn('relative', variant === 'inline' ? 'inline-flex' : 'w-full', className)}>
      <select
        id={field.id}
        aria-describedby={field.describedBy}
        aria-invalid={isInvalid || undefined}
        className={cn(
          'min-w-0 text-base md:text-sm cursor-pointer appearance-none text-foreground transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
          variantClasses[variant],
          props.value === '' && 'text-muted',
          isInvalid && invalidClass(variant),
        )}
        {...props}
      >
        {placeholder !== undefined && (
          <option value="" disabled={props.required}>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className={cn(
          'size-4 pointer-events-none absolute top-1/2 -translate-y-1/2 opacity-60',
          variant === 'inline' ? 'right-2.5' : 'right-3.5',
        )}
      />
    </div>
  )
}
