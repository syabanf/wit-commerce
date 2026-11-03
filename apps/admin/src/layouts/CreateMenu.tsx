import { ActionMenu } from '@rc/ui'
import {
  BadgePercent,
  Handshake,
  Megaphone,
  Package,
  UserPlus,
  UserRoundPlus,
  UsersRound,
} from 'lucide-react'
import type { ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/auth'
import { paths } from '../components/links'
import { CREATE_CODE } from './nav'

export interface CreateAction {
  key: string
  label: string
  description: string
  icon: ReactElement
  to: string
  code: string
}

/** What this user may create, for the create menu and quick search. */
export function useCreateActions(): CreateAction[] {
  const { can } = useAuth()
  const options: (CreateAction | false)[] = [
    can('product.manage') && {
      key: 'product',
      label: 'Product',
      description: 'Physical, digital, service or bundle',
      icon: <Package />,
      to: paths.newProduct,
      code: CREATE_CODE.product,
    },
    can('customer.manage') && {
      key: 'customer',
      label: 'Customer',
      description: 'Add a buyer by hand',
      icon: <UserPlus />,
      to: '/customers/all?new=1',
      code: CREATE_CODE.customer,
    },
    can('lead.manage') && {
      key: 'lead',
      label: 'Lead',
      description: 'An assisted sale to follow up',
      icon: <Handshake />,
      to: '/customers/leads?new=1',
      code: CREATE_CODE.lead,
    },
    can('segment.manage') && {
      key: 'segment',
      label: 'Segment',
      description: 'An audience built from rules',
      icon: <UsersRound />,
      to: paths.newSegment,
      code: CREATE_CODE.segment,
    },
    can('campaign.manage') && {
      key: 'campaign',
      label: 'Campaign',
      description: 'Message a segment across channels',
      icon: <Megaphone />,
      to: '/marketing/campaigns?new=1',
      code: CREATE_CODE.campaign,
    },
    can('promotion.manage') && {
      key: 'promotion',
      label: 'Promotion',
      description: 'Voucher, discount or free shipping',
      icon: <BadgePercent />,
      to: '/marketing/promotions?new=1',
      code: CREATE_CODE.promotion,
    },
    can('seller.manage') && {
      key: 'seller',
      label: 'Seller',
      description: 'Invite a sales agent, reseller or affiliate',
      icon: <UserRoundPlus />,
      to: '/sales/sellers?new=1',
      code: CREATE_CODE.seller,
    },
  ]
  return options.filter((x): x is CreateAction => !!x)
}

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
  const actions = useCreateActions()
  if (!actions.length) return null
  const items = actions.map(({ key, label, description, icon, to }) => ({
    key,
    label,
    description,
    icon,
    onSelect: () => navigate(to),
  }))
  return <ActionMenu trigger={trigger} items={items} title="Create" side={side} align={align} />
}
