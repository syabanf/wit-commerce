import { cn } from '../lib/cn'
import { useFieldControl } from './form-field'

export type SwitchProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  'aria-label'?: string
  size?: 'sm' | 'md'
  className?: string
}

export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  id,
  'aria-label': ariaLabel,
  size = 'md',
  className,
}: SwitchProps) {
  const md = size === 'md'
  const field = useFieldControl(id)
  return (
    <button
      type="button"
      role="switch"
      id={field.id}
      aria-describedby={field.describedBy}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      data-state={checked ? 'checked' : 'unchecked'}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'group relative inline-flex shrink-0 items-center rounded-full bg-silver/60 transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent',
        md ? 'h-7 w-12' : 'h-5 w-9',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'left-0.5 bg-white shadow-sm absolute rounded-full transition-transform',
          md
            ? 'size-6 group-data-[state=checked]:translate-x-5'
            : 'size-4 group-data-[state=checked]:translate-x-4',
        )}
      />
    </button>
  )
}
