import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { MenuItem } from '../lib/menus'

/** One store menu link: a Link inside the store, or a plain link that opens a new tab. */
export function MenuLink({
  item,
  className,
  onClick,
  children,
}: {
  item: MenuItem
  className?: string
  onClick?: () => void
  children?: ReactNode
}) {
  if (item.external)
    return (
      <a href={item.to} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
        {children ?? item.label}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    )
  return (
    <Link to={item.to} className={className} onClick={onClick}>
      {children ?? item.label}
    </Link>
  )
}
