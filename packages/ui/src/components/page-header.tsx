import { type ComponentProps, Fragment, type ReactNode } from 'react'
import { cn } from '../lib/cn'

const kickerClass = 'text-[0.6875rem] font-semibold uppercase tracking-wider text-muted'

export function Kicker({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn(kickerClass, className)} {...props} />
}

export type PageHeaderProps = {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
  className?: string
}

/** One masked span per word, so the entrance can lift each word out of its line. */
function Words({ text }: { text: string }) {
  return text.split(' ').map((word, i) => (
    <Fragment key={i}>
      {i > 0 && ' '}
      <span className="-mb-[0.1em] inline-block overflow-hidden pb-[0.1em] align-bottom">
        <span data-word className="inline-block">
          {word}
        </span>
      </span>
    </Fragment>
  ))
}

export function PageHeader({ title, description, actions, eyebrow, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 gap-3 flex flex-wrap items-start justify-between', className)}>
      <div className="min-w-0">
        {eyebrow !== undefined && <div className={cn(kickerClass, 'mb-1')}>{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight">
          {typeof title === 'string' ? <Words text={title} /> : title}
        </h1>
        {description !== undefined && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {/* max-w-full caps the actions at the header width, so a wide pill tab row scrolls instead of the page. */}
      {actions !== undefined && (
        <div className="min-w-0 gap-2 flex max-w-full flex-wrap items-center">{actions}</div>
      )}
    </div>
  )
}
