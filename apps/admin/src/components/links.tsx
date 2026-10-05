import { Avatar, cn } from '@rc/ui'
import { Link } from 'react-router'
import { useScoped } from '../state/scoped'

/** Routes for entity pages, shared by every feature. Build every in-app link through these. */
export const paths = {
  order: (id: string) => `/commerce/orders/${id}`,
  product: (id: string) => `/commerce/products/${id}`,
  newProduct: '/commerce/products/new',
  page: (id: string) => `/store/pages/${id}`,
  customer: (id: string) => `/customers/all/${id}`,
  segment: (id: string) => `/customers/segments/${id}`,
  newSegment: '/customers/segments/new',
  lead: (id: string) => `/customers/leads/${id}`,
  ticket: (id: string) => `/customers/support?ticket=${id}`,
  campaign: (id: string) => `/marketing/campaigns/${id}`,
  automation: (id: string) => `/marketing/automations/${id}`,
  promotion: (id: string) => `/marketing/promotions?id=${id}`,
  seller: (id: string) => `/sales/sellers/${id}`,
  integration: (id: string) => `/integrations?id=${id}`,
  newTenant: '/settings/tenants/new',
}

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

/** Avatar, name and code of a customer, linking to their Customer 360. */
export function CustomerLink({
  customerId,
  className,
  showAvatar = true,
}: {
  customerId: string
  className?: string
  showAvatar?: boolean
}) {
  const { maps } = useScoped()
  const c = maps.customer.get(customerId)
  if (!c) return <span className="text-muted">Removed customer</span>
  return (
    <Link
      to={paths.customer(c.id)}
      onClick={stop}
      className={cn('group min-w-0 gap-2 inline-flex items-center hover:text-accent', className)}
    >
      {showAvatar && <Avatar name={c.name} color={c.color} size="sm" />}
      <span className="min-w-0">
        <span className="font-medium block truncate">{c.name}</span>
        <span className="block truncate font-mono text-[11px] text-muted">{c.code}</span>
      </span>
    </Link>
  )
}

/** Mono order code linking to the order. */
export function OrderLink({ orderId, className }: { orderId: string; className?: string }) {
  const { maps } = useScoped()
  const o = maps.order.get(orderId)
  if (!o) return <span className="text-muted">Removed order</span>
  return (
    <Link
      to={paths.order(o.id)}
      onClick={stop}
      className={cn(
        'text-xs font-medium font-mono text-foreground hover:text-accent hover:underline',
        className,
      )}
    >
      {o.code}
    </Link>
  )
}

/** Name over code of a product, linking to it. */
export function ProductLink({ productId, className }: { productId: string; className?: string }) {
  const { maps } = useScoped()
  const p = maps.product.get(productId)
  if (!p) return <span className="text-muted">Removed product</span>
  return (
    <Link
      to={paths.product(p.id)}
      onClick={stop}
      className={cn('min-w-0 inline-flex flex-col hover:text-accent', className)}
    >
      <span className="font-medium truncate">{p.name}</span>
      <span className="truncate font-mono text-[11px] text-muted">{p.code}</span>
    </Link>
  )
}

/** Seller avatar and name, linking to the seller. Null reads "Direct". */
export function SellerChip({ sellerId, hint }: { sellerId: string | null; hint?: string }) {
  const { maps } = useScoped()
  const s = sellerId ? maps.seller.get(sellerId) : undefined
  if (!s) return <span className="text-muted">Direct</span>
  return (
    <Link
      to={paths.seller(s.id)}
      onClick={stop}
      className="min-w-0 gap-2 inline-flex items-center hover:text-accent"
    >
      <Avatar name={s.name} color={s.color} size="xs" />
      <span className="min-w-0 truncate">{s.name}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </Link>
  )
}

/** Avatar and name of a console user. Null reads "Unassigned". */
export function PersonChip({ userId, hint }: { userId: string | null; hint?: string }) {
  const { maps, userName } = useScoped()
  if (!userId) return <span className="text-muted">Unassigned</span>
  return (
    <span className="min-w-0 gap-2 inline-flex items-center">
      <Avatar name={userName(userId)} color={maps.user.get(userId)?.color} size="xs" />
      <span className="min-w-0 truncate">{userName(userId)}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </span>
  )
}
