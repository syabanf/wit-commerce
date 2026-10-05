import { Children, isValidElement, type ComponentProps, type ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { LoaderCircle } from 'lucide-react'
import { Slot } from 'radix-ui'
import { cn } from '../lib/cn'

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent-strong text-white shadow-glow hover:bg-accent-dark',
        secondary: 'bg-ink text-on-ink hover:bg-ink-3',
        outline: 'border border-border bg-card text-foreground hover:bg-surface',
        ghost: 'text-foreground hover:bg-black/5',
        link: 'text-accent-strong underline-offset-4 hover:underline',
        danger: 'bg-danger-soft text-accent-strong hover:bg-accent-strong hover:text-white',
        card: 'bg-card text-foreground shadow-card hover:bg-surface',
        soft: 'bg-surface text-foreground hover:bg-surface-2',
        onInk: 'bg-white/10 text-white hover:bg-white/20',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
        icon: 'size-10',
        'icon-sm': 'size-8',
        'icon-lg': 'size-11',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean }

function isIcon(node: ReactNode): boolean {
  return isValidElement(node) && (typeof node.type !== 'string' || node.type === 'svg')
}

/** Replaces the first icon child with a spinner, or prepends one when there is no icon. */
function withSpinner(children: ReactNode): ReactNode {
  const spinner = <LoaderCircle key="spinner" aria-hidden="true" className="animate-spin" />
  const nodes = Children.toArray(children)
  const iconIndex = nodes.findIndex(isIcon)
  if (iconIndex === -1) return [spinner, ...nodes]
  return nodes.map((node, index) => (index === iconIndex ? spinner : node))
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className)
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    )
  }
  return (
    <button className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? withSpinner(children) : children}
    </button>
  )
}
