import type { ComponentProps } from 'react'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { cn } from '../lib/cn'
import { closeButtonClass, overlayClass, useReturnFocus } from '../lib/overlay'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const

export type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  size?: keyof typeof sizes
  hideClose?: boolean
}

export function DialogContent({
  size = 'md',
  hideClose = false,
  className,
  children,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: DialogContentProps) {
  const focus = useReturnFocus({ onOpenAutoFocus, onCloseAutoFocus })
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        {...focus}
        className={cn(
          'p-6 fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-card bg-card text-foreground shadow-float duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          sizes[size],
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className={cn(closeButtonClass, 'text-muted hover:bg-surface hover:text-foreground')}
          >
            <X aria-hidden="true" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mb-4 gap-1 pr-6 flex flex-col', className)} {...props} />
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('mt-6 gap-2 sm:flex-row sm:justify-end flex flex-col-reverse', className)}
      {...props}
    />
  )
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold leading-tight', className)} {...props} />
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-sm text-muted', className)} {...props} />
}
