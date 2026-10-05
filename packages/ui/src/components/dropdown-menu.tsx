import type { ComponentProps } from 'react'
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'
import { cn } from '../lib/cn'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuGroup = DropdownMenuPrimitive.Group

export function DropdownMenuContent({
  className,
  sideOffset = 8,
  collisionPadding = 8,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          'min-w-48 rounded-2xl p-1 z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-x-hidden overflow-y-auto border border-border bg-card text-foreground shadow-float outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export type DropdownMenuItemProps = ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  destructive?: boolean
}

export function DropdownMenuItem({ className, destructive = false, ...props }: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'gap-2 rounded-xl px-3 py-2 text-sm [&_svg]:size-4 relative flex cursor-pointer items-center transition-colors outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface [&_svg]:shrink-0',
        destructive && 'text-accent',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn(
        'px-3 pb-1 pt-2 font-semibold tracking-wider text-[11px] text-muted uppercase',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
}
