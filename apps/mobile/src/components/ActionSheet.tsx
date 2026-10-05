import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@rc/ui'
import type { ReactNode } from 'react'

/**
 * One action on the phone: a bottom sheet with a title, a one-line rule and a form.
 * The body mounts only while open, so the form resets each time.
 */
export function ActionSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-w-md mx-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {open && <div className="px-5 pb-2">{children}</div>}
      </SheetContent>
    </Sheet>
  )
}
