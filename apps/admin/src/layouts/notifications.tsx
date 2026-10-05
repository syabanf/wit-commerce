import { NOTIFICATION_KIND_LABEL, type NotificationItem, deriveNotifications, fmtAgo } from '@rc/fixtures'
import {
  Button,
  EmptyState,
  IconTile,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  cn,
  useIsPhone,
} from '@rc/ui'
import { Bell, BellOff, Boxes, CreditCard, Handshake, Headset, Megaphone, Plug, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '../components/links'
import { usePersistentState } from '../lib/storage'
import { useScoped } from '../state/scoped'

const KIND_ICON = {
  low_stock: Boxes,
  payment_expiring: CreditCard,
  ship_late: Truck,
  ticket_sla: Headset,
  integration: Plug,
  lead_stale: Handshake,
  campaign_ending: Megaphone,
} as const

function targetPath(n: NotificationItem): string {
  const { kind, id } = n.target
  switch (kind) {
    case 'product':
      return paths.product(id)
    case 'order':
      return paths.order(id)
    case 'ticket':
      return paths.ticket(id)
    case 'integration':
      return paths.integration(id)
    case 'lead':
      return paths.lead(id)
    case 'campaign':
      return paths.campaign(id)
  }
}

export function useNotifications() {
  const s = useScoped()
  return useMemo(
    () =>
      deriveNotifications({
        products: s.products,
        stock: s.stock,
        orders: s.orders,
        tickets: s.tickets,
        integrations: s.integrations,
        leads: s.leads,
        campaigns: s.campaigns,
      }),
    [s],
  )
}

export function NotificationsButton() {
  const { user, tenantId } = useScoped()
  const items = useNotifications()
  const [readIds, setReadIds] = usePersistentState<string[]>(`rc.admin.read.${user.id}.${tenantId}`, [])
  const [open, setOpen] = useState(false)
  const isPhone = useIsPhone()
  const navigate = useNavigate()
  const unread = items.filter((i) => !readIds.includes(i.id)).length

  const openItem = (n: NotificationItem) => {
    setReadIds((ids) => (ids.includes(n.id) ? ids : [...ids, n.id]))
    setOpen(false)
    navigate(targetPath(n))
  }

  const trigger = (
    <Button
      variant="card"
      size="icon-lg"
      className="relative"
      aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <Bell />
      {unread > 0 && (
        <span className="-right-1 -top-1 px-1 font-bold absolute flex h-[19px] min-w-[19px] items-center justify-center rounded-full border-2 border-surface bg-accent text-[10.5px] text-on-ink">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Button>
  )

  const body = (
    <>
      <div className="gap-3 px-4 pb-2 pt-4 flex items-center justify-between">
        <div>
          <p className="text-base font-semibold">Attention required</p>
          <p className="text-xs text-muted">{unread ? `${unread} unread` : 'All caught up'}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setReadIds(items.map((i) => i.id))}
          disabled={!unread}
        >
          Mark all read
        </Button>
      </div>
      <div className="p-2 max-h-[min(70dvh,480px)] overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState
            compact
            icon={<BellOff />}
            title="Nothing needs attention"
            description="Low stock, unpaid orders, late shipments, support SLAs and failing integrations show up here."
          />
        ) : (
          items.map((n) => {
            const Icon = KIND_ICON[n.kind]
            const isRead = readIds.includes(n.id)
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => openItem(n)}
                className={cn(
                  'gap-3 rounded-2xl p-3 flex w-full items-start text-left transition-colors hover:bg-surface',
                  isRead && 'opacity-70',
                )}
              >
                <IconTile size="sm" tone={n.tone}>
                  <Icon />
                </IconTile>
                <span className="min-w-0 flex-1">
                  <span className="gap-2 flex items-start justify-between">
                    <span className="text-sm font-semibold leading-snug">{n.title}</span>
                    {!isRead && (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />
                    )}
                  </span>
                  <span className="mt-0.5 text-xs block text-muted">{n.body}</span>
                  <span className="mt-1 font-medium block text-[11px] text-silver">
                    {NOTIFICATION_KIND_LABEL[n.kind]} · {fmtAgo(n.at)}
                  </span>
                </span>
              </button>
            )
          })
        )}
      </div>
    </>
  )

  if (isPhone) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" aria-describedby={undefined}>
          <SheetHeader className="sr-only">
            <SheetTitle>Notifications</SheetTitle>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="p-0 w-[400px]">
        {body}
      </PopoverContent>
    </Popover>
  )
}
