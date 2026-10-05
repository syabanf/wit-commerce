import type { ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../lib/cn'

export type Tone = 'default' | 'danger' | 'success' | 'warning' | 'info' | 'ink' | 'accent'

// Soft tints for status tones; ink and accent are the only solid fills.
const iconTileVariants = cva('flex shrink-0 items-center justify-center [&_svg]:shrink-0', {
  variants: {
    tone: {
      default: 'bg-surface text-body',
      danger: 'bg-accent-soft text-accent',
      success: 'bg-success-soft text-success',
      warning: 'bg-warning-soft text-warning',
      info: 'bg-info-soft text-info',
      ink: 'bg-ink text-on-ink',
      accent: 'bg-accent text-white',
    },
    size: {
      sm: 'size-9 rounded-xl [&_svg]:size-4',
      md: 'size-[42px] rounded-[13px] [&_svg]:size-[18px]',
      lg: 'size-12 rounded-2xl [&_svg]:size-5',
    },
    shape: { square: '', round: 'rounded-full' },
  },
  defaultVariants: { tone: 'default', size: 'md', shape: 'square' },
})

export type IconTileProps = {
  tone?: Tone
  size?: 'sm' | 'md' | 'lg'
  shape?: 'square' | 'round'
  className?: string
  children: ReactNode
}

export function IconTile({ tone, size, shape, className, children }: IconTileProps) {
  return <span className={cn(iconTileVariants({ tone, size, shape }), className)}>{children}</span>
}
