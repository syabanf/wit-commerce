import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { cn } from '../lib/cn'
import { Button } from './button'

type BannerTone = 'info' | 'warning' | 'danger' | 'success' | 'neutral'

const tones: Record<BannerTone, { box: string; tile: string; icon: ReactNode }> = {
  info: { box: 'bg-info-soft', tile: 'bg-card text-info', icon: <Info /> },
  warning: { box: 'bg-warning-soft', tile: 'bg-card text-warning', icon: <TriangleAlert /> },
  danger: { box: 'bg-danger-soft', tile: 'bg-card text-danger', icon: <CircleAlert /> },
  success: { box: 'bg-success-soft', tile: 'bg-card text-success', icon: <CircleCheck /> },
  neutral: { box: 'bg-card shadow-card', tile: 'bg-surface text-body', icon: <Info /> },
}

export type BannerProps = {
  tone?: BannerTone
  icon?: ReactNode
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  onDismiss?: () => void
  className?: string
}

export function Banner({ tone = 'info', icon, title, children, action, onDismiss, className }: BannerProps) {
  const style = tones[tone]
  return (
    <div className={cn('gap-3 px-4 py-3 flex flex-wrap items-center rounded-card', style.box, className)}>
      <span
        className={cn(
          'size-9 [&_svg]:size-4 flex shrink-0 items-center justify-center rounded-full',
          style.tile,
        )}
      >
        {icon ?? style.icon}
      </span>
      <div className="text-sm min-w-[12rem] flex-1">
        {title !== undefined && <p className="font-semibold text-foreground">{title}</p>}
        {children !== undefined && <div className="text-body/70">{children}</div>}
      </div>
      {action !== undefined && <div className="gap-2 flex shrink-0 items-center">{action}</div>}
      {onDismiss && (
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={onDismiss}>
          <X />
        </Button>
      )}
    </div>
  )
}
