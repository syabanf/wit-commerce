import { ActionMenu, type ActionMenuItem } from '@rc/ui'
import {
  BadgePercent,
  Handshake,
  Megaphone,
  Package,
  PanelsTopLeft,
  UserPlus,
  UserRoundPlus,
  UsersRound,
} from 'lucide-react'
import type { ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/auth'
import { paths } from '../components/links'

/** The one create menu behind the rail button, the header button and the phone bar. */
export function CreateMenu({
  trigger,
  side,
  align,
}: {
  trigger: ReactElement
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}) {
  const navigate = useNavigate()
  const { can } = useAuth()
  const options: (ActionMenuItem | false)[] = [
    can('product.manage') && {
      key: 'product',
      label: 'Product',
      description: 'Physical, digital, service or bundle',
      icon: <Package />,
      onSelect: () => navigate(paths.newProduct),
    },
    can('customer.manage') && {
      key: 'customer',
      label: 'Customer',
      description: 'Add a buyer by hand',
      icon: <UserPlus />,
      onSelect: () => navigate('/customers/all?new=1'),
    },
    can('lead.manage') && {
      key: 'lead',
      label: 'Lead',
      description: 'An assisted sale to follow up',
      icon: <Handshake />,
      onSelect: () => navigate('/customers/leads?new=1'),
    },
    can('segment.manage') && {
      key: 'segment',
      label: 'Segment',
      description: 'An audience built from rules',
      icon: <UsersRound />,
      onSelect: () => navigate(paths.newSegment),
    },
    can('campaign.manage') && {
      key: 'campaign',
      label: 'Campaign',
      description: 'Message a segment across channels',
      icon: <Megaphone />,
      onSelect: () => navigate('/marketing/campaigns?new=1'),
    },
    can('promotion.manage') && {
      key: 'promotion',
      label: 'Promotion',
      description: 'Voucher, discount or free shipping',
      icon: <BadgePercent />,
      onSelect: () => navigate('/marketing/promotions?new=1'),
    },
    can('store.manage') && {
      key: 'page',
      label: 'Page',
      description: 'Landing or campaign page from a template',
      icon: <PanelsTopLeft />,
      onSelect: () => navigate('/store/pages?new=1'),
    },
    can('seller.manage') && {
      key: 'seller',
      label: 'Seller',
      description: 'Invite a sales agent, reseller or affiliate',
      icon: <UserRoundPlus />,
      onSelect: () => navigate('/sales/sellers?new=1'),
    },
  ]
  const items = options.filter((x): x is ActionMenuItem => !!x)
  if (!items.length) return null
  return <ActionMenu trigger={trigger} items={items} title="Create" side={side} align={align} />
}
