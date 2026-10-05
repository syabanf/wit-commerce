import { cn } from '@rc/ui'
import { X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { useBrand } from './BrandRoot'

const SIDE = {
  /** Bottom sheet on phones, floating right panel from md up. */
  auto: 'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[max(var(--sf-card-radius),16px)] md:inset-x-auto md:inset-y-3 md:right-3 md:bottom-3 md:max-h-none md:w-[440px] md:rounded-[var(--sf-card-radius)] data-[state=open]:slide-in-from-bottom md:data-[state=open]:slide-in-from-right',
  left: 'inset-y-0 left-0 w-[min(88vw,380px)] data-[state=open]:slide-in-from-left',
  right: 'inset-y-0 right-0 w-[min(94vw,440px)] data-[state=open]:slide-in-from-right',
} as const

/** A sheet that portals out of the page but keeps the tenant's brand tokens and theme. */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  side = 'auto',
  footer,
  children,
  bodyClassName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  side?: keyof typeof SIDE
  footer?: ReactNode
  children: ReactNode
  bodyClassName?: string
}) {
  const { style, theme } = useBrand()
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Radix replaces the content's style prop, so the brand variables ride on a box-less wrapper. */}
        <div className="sf-root contents" data-theme={theme} style={style}>
          <Dialog.Overlay className="inset-0 bg-black/40 fixed z-50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content
            className={cn(
              'fixed z-50 flex flex-col bg-[var(--sf-bg)] shadow-float outline-none data-[state=open]:animate-in data-[state=open]:duration-200',
              SIDE[side],
            )}
          >
            <div className="gap-3 px-5 pt-4 pb-3 flex items-start">
              <div className="min-w-0 pt-2 flex-1">
                <Dialog.Title className="sf-display text-lg leading-tight font-bold">{title}</Dialog.Title>
                {description ? (
                  <Dialog.Description className="mt-1 text-sm text-[color:var(--sf-muted)]">
                    {description}
                  </Dialog.Description>
                ) : (
                  <Dialog.Description className="sr-only">{title}</Dialog.Description>
                )}
              </div>
              <Dialog.Close className="size-11 inline-flex shrink-0 items-center justify-center rounded-full hover:bg-[var(--sf-soft)]">
                <X className="size-5" aria-hidden="true" />
                <span className="sr-only">Close</span>
              </Dialog.Close>
            </div>
            <div className={cn('min-h-0 px-5 pb-5 flex-1 overflow-y-auto', bodyClassName)}>{children}</div>
            {footer && (
              <div className="gap-2 px-5 py-4 flex flex-wrap border-t border-[color:var(--sf-line)] pb-[max(env(safe-area-inset-bottom),1rem)]">
                {footer}
              </div>
            )}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
