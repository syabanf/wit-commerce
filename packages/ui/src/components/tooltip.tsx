import {
  createContext,
  useContext,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react'
import { Tooltip as TooltipPrimitive } from 'radix-ui'

const ProviderMounted = createContext(false)

/** Mount once near the root so neighbouring tooltips share their open delay. */
export function TooltipProvider({
  delayDuration = 300,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <ProviderMounted value={true}>
      <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />
    </ProviderMounted>
  )
}

export type TooltipProps = {
  content: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  disabled?: boolean
  /** A single element that accepts a ref and DOM props. */
  children: ReactElement
}

export function Tooltip({
  content,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  disabled = false,
  children,
}: TooltipProps) {
  const hasProvider = useContext(ProviderMounted)
  const [open, setOpen] = useState(false)
  const inactive =
    disabled || content === null || content === undefined || content === false || content === ''

  // Always controlled, so toggling `disabled` never remounts the trigger.
  const tooltip = (
    <TooltipPrimitive.Root open={open && !inactive} onOpenChange={setOpen}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={8}
          className="max-w-xs rounded-xl px-2.5 py-1.5 text-xs font-medium z-50 animate-in bg-ink text-on-ink shadow-float fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )

  if (hasProvider) return tooltip
  return <TooltipPrimitive.Provider delayDuration={300}>{tooltip}</TooltipPrimitive.Provider>
}
