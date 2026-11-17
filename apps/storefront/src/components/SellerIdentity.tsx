import { BUSINESS_TYPE_LABEL } from '@rc/types'
import { cn } from '@rc/ui'
import { Link } from 'react-router'
import { paths } from '../lib/paths'
import { useShop } from '../state/shop'

/**
 * Who the shopper buys from (PP 80/2019 Pasal 9 and 13): the brand's legal name, NIB, address and
 * customer service, with the help, terms and privacy pages. Every theme's footer shows it.
 */
export function SellerIdentity({ className, center }: { className?: string; center?: boolean }) {
  const { tenant, store } = useShop()
  const l = tenant.legal ?? {}
  const contact = [l.phone, l.email, l.hours].filter(Boolean).join(' · ')
  const links = [
    { label: 'Help & complaints', to: paths.help(store) },
    { label: 'Terms', to: paths.terms(store) },
    { label: 'Privacy', to: paths.privacy(store) },
  ]
  return (
    <div className={cn('space-y-1 text-xs text-[color:var(--sf-muted)]', center && 'text-center', className)}>
      <p>
        Sold by{' '}
        <span className="font-semibold text-[color:var(--sf-text)]">{l.entityName ?? tenant.name}</span>
        {l.businessType && l.businessType !== 'perorangan' && !l.entityName?.match(/^(PT|CV)\b/i)
          ? ` (${BUSINESS_TYPE_LABEL[l.businessType]})`
          : ''}
        {l.nib && <span className="whitespace-nowrap"> · NIB {l.nib}</span>}
      </p>
      {l.address && <p>{l.address}</p>}
      {contact && <p>Customer service: {contact}</p>}
      <nav aria-label="Store policies">
        <ul className={cn('gap-x-4 flex flex-wrap', center && 'justify-center')}>
          {links.map((link) => (
            <li key={link.label}>
              <Link
                to={link.to}
                className="min-h-9 font-semibold inline-flex items-center underline-offset-4 hover:underline"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
