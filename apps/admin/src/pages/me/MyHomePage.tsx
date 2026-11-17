import { fmtAgo, fmtIdr, listOf } from '@rc/fixtures'
import { ORDER_STATUS_LABEL, ROLE_LABEL } from '@rc/types'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  StatCard,
} from '@rc/ui'
import { Handshake, Headset, History, ShoppingBag } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/auth'
import { OrderStatusBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { mayOpen } from '../../layouts/nav'
import { useNow, useScoped } from '../../state/scoped'
import { myWork } from './lib'

/** The employee area's home: who you are here and what waits for you. */
export function MyHomePage() {
  const s = useScoped()
  const { tenants } = useAuth()
  const now = useNow(60_000)
  const navigate = useNavigate()
  const work = useMemo(() => myWork(s), [s])
  const ordersOpen = mayOpen(s.user.role, '/commerce/orders')

  return (
    <>
      <PageHeader
        title={`Hello, ${s.user.name.split(' ')[0]}`}
        eyebrow={`${ROLE_LABEL[s.user.role]} · ${listOf(tenants.map((t) => t.name))}`}
        description="The work that waits for you at this brand."
      />
      <div className="gap-4 sm:grid-cols-2 xl:grid-cols-3 grid grid-cols-1">
        <StatCard
          label="Tickets assigned to me"
          value={work.openTickets.length}
          hint={work.openTickets.length ? 'Open or waiting on the customer' : 'Nothing waits for you'}
          icon={<Headset />}
          tone={work.openTickets.length ? 'accent' : 'default'}
          onClick={() => navigate('/me/tasks')}
        />
        {work.seller && (
          <>
            <StatCard
              label="My open leads"
              value={work.leads.length}
              hint="Leads on your seller profile that need a next step"
              icon={<Handshake />}
              onClick={() => navigate('/me/tasks')}
            />
            <StatCard
              label="My orders to follow"
              value={work.orders.length}
              hint="Sold through you and still on the way"
              icon={<ShoppingBag />}
              onClick={ordersOpen ? () => navigate('/commerce/orders') : undefined}
            />
          </>
        )}
      </div>

      {work.seller && work.orders.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Orders to follow</CardTitle>
            <CardDescription>
              Orders sold through your seller profile that have not arrived yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {work.orders.slice(0, 5).map((order) => (
                <li key={order.id} className="gap-2 py-3 text-sm flex flex-wrap items-center justify-between">
                  <span className="min-w-0">
                    {ordersOpen ? (
                      <Link
                        to={paths.order(order.id)}
                        className="text-xs font-semibold font-mono hover:text-accent hover:underline"
                      >
                        {order.code}
                      </Link>
                    ) : (
                      <span className="text-xs font-semibold font-mono">{order.code}</span>
                    )}
                    <span className="block truncate text-muted">
                      {s.customerName(order.customerId)} · {fmtIdr(order.total)}
                    </span>
                  </span>
                  <OrderStatusBadge status={order.status} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>My recent activity</CardTitle>
          <CardDescription>Your latest steps on orders that are still under way.</CardDescription>
        </CardHeader>
        <CardContent>
          {work.recent.length === 0 ? (
            <EmptyState
              compact
              icon={<History />}
              title="No activity yet"
              description="When you confirm, pack, ship or note an order, the step appears here."
            />
          ) : (
            <ul className="divide-y divide-border">
              {work.recent.map(({ order, event }) => (
                <li key={event.id} className="gap-2 py-3 text-sm flex flex-wrap items-center justify-between">
                  <span className="min-w-0">
                    <span className="text-xs font-semibold font-mono">{order.code}</span>
                    <span className="block truncate text-muted">
                      {event.note || (event.status ? ORDER_STATUS_LABEL[event.status] : 'Updated')}
                    </span>
                  </span>
                  <span className="text-xs text-muted">{fmtAgo(event.at, now)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {tenants.length > 1 && (
        <p className="mt-4 text-xs text-muted">
          Switch brand from the menu to see your work at another brand.
        </p>
      )}
    </>
  )
}
