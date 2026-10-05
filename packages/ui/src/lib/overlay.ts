import { useRef } from 'react'
// Shared by Dialog, Sheet and ConfirmDialog.
export const overlayClass =
  'fixed inset-0 z-50 bg-ink/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0'

export const closeButtonClass =
  'absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 [&_svg]:size-4'

type AutoFocusHandlers = {
  onOpenAutoFocus?: (event: Event) => void
  onCloseAutoFocus?: (event: Event) => void
}

/**
 * Hands focus back to the element that opened an overlay. Radix does this for its own trigger, but
 * dialogs and sheets opened from code (a menu item, a global create action) have none. The opener is
 * read when the overlay opens, because the content wrapper stays mounted while it is closed.
 */
export function useReturnFocus({
  onOpenAutoFocus,
  onCloseAutoFocus,
}: AutoFocusHandlers): Required<AutoFocusHandlers> {
  const opener = useRef<Element | null>(null)
  return {
    onOpenAutoFocus: (event) => {
      opener.current = document.activeElement
      onOpenAutoFocus?.(event)
    },
    onCloseAutoFocus: (event) => {
      onCloseAutoFocus?.(event)
      const el = opener.current
      if (event.defaultPrevented || !(el instanceof HTMLElement) || !el.isConnected) return
      event.preventDefault()
      el.focus()
    },
  }
}
