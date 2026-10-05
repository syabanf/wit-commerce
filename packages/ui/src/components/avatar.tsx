import { cn } from '../lib/cn'
import { AVATAR_PALETTE } from '../lib/palette'

const sizes = {
  xs: 'size-6 text-[9px]',
  sm: 'size-7 text-[10px]',
  md: 'size-9 text-xs',
  lg: 'size-12 text-sm',
  xl: 'size-20 text-2xl',
} as const

type AvatarSize = keyof typeof sizes

function colorFor(name: string): string {
  let hash = 0
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]!
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase()
}

export type AvatarProps = {
  name: string
  color?: string
  size?: AvatarSize
  ring?: boolean
  className?: string
}

export function Avatar({ name, color, size = 'md', ring = false, className }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      style={{ backgroundColor: color ?? colorFor(name) }}
      className={cn(
        'font-semibold text-white inline-flex shrink-0 items-center justify-center rounded-full leading-none select-none',
        sizes[size],
        ring && 'shadow-card ring-4 ring-card',
        className,
      )}
    >
      <span aria-hidden="true">{initialsOf(name)}</span>
    </span>
  )
}

export type AvatarStackProps = {
  people: { name: string; color?: string }[]
  max?: number
  size?: 'xs' | 'sm' | 'md'
  className?: string
}

export function AvatarStack({ people, max = 4, size = 'sm', className }: AvatarStackProps) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <div className={cn('-space-x-2 flex items-center', className)}>
      {shown.map((person, index) => (
        <Avatar
          key={`${person.name}-${index}`}
          name={person.name}
          color={person.color}
          size={size}
          className="ring-2 ring-card"
        />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            'font-semibold inline-flex shrink-0 items-center justify-center rounded-full bg-surface leading-none text-body ring-2 ring-card',
            sizes[size],
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}
