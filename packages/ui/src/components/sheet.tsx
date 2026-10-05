import type { ComponentProps } from 'react'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { cn } from '../lib/cn'
import { closeButtonClass, overlayClass, useReturnFocus } from '../lib/overlay'

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

const rightSizes = {
  md: 'max-w-md',
  lg: 'max-w-xl',
  xl: 'max-w-2xl',
} as const

export type SheetContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  side?: 'right' | 'bottom'
  tone?: 'light' | 'dark'
  size?: keyof typeof rightSizes
  hideClose?: boolean
}

/**
 * `side="right"` is a floating detail panel for tablet and up. `side="bottom"` is the phone
 * sheet used for every menu, filter and picker below `md`.
 */
export function SheetContent({
  side = 'right',
  tone = 'light',
  size = 'md',
  hideClose = false,
  className,
  children,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: SheetContentProps) {
  const dark = tone === 'dark'
  const focus = useReturnFocus({ onOpenAutoFocus, onCloseAutoFocus })
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        {...focus}
        className={cn(
          'fixed z-50 shadow-float duration-200 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in',
          dark ? 'bg-ink text-on-ink' : 'bg-card text-foreground',
          side === 'right'
            ? [
                'inset-y-3 right-3 flex w-[calc(100%-1.5rem)] flex-col rounded-hero data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
                rightSizes[size],
              ]
            : 'inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[28px] pb-[max(env(safe-area-inset-bottom),1rem)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          className,
        )}
        {...props}
      >
        {side === 'bottom' && (
          <div
            aria-hidden="true"
            className={cn(
              'mt-3 h-1.5 w-10 mx-auto shrink-0 rounded-full',
              dark ? 'bg-white/20' : 'bg-border',
            )}
          />
        )}
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className={cn(
              closeButtonClass,
              dark
                ? 'hover:bg-white/10 hover:text-white text-on-ink-muted'
                : 'text-muted hover:bg-surface hover:text-foreground',
            )}
          >
            <X aria-hidden="true" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('gap-1 px-5 pb-3 pr-14 pt-5 flex flex-col', className)} {...props} />
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold leading-tight', className)} {...props} />
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-sm text-muted', className)} {...props} />
}

export function SheetBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('min-h-0 px-5 pb-5 flex-1 overflow-y-auto', className)} {...props} />
}

export function SheetFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('gap-2 px-5 py-4 flex items-center justify-end border-t border-border', className)}
      {...props}
    />
  )
}
