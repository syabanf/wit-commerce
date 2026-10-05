import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '../lib/cn'

export type StepState = 'done' | 'current' | 'upcoming' | 'skipped'

export type StepsProps = {
  steps: { key: string; label: ReactNode; state: StepState; hint?: ReactNode }[]
  className?: string
}

const stateClasses: Record<StepState, string> = {
  current: 'bg-ink text-on-ink',
  done: 'bg-card text-foreground shadow-card',
  upcoming: 'bg-surface-2 text-muted',
  skipped: 'bg-surface-2 text-silver',
}

/** Pill stepper that scrolls sideways when it does not fit. */
export function Steps({ steps, className }: StepsProps) {
  return (
    <div className="relative">
      <ol className={cn('gap-2 pb-2 pr-10 no-scrollbar flex overflow-x-auto', className)}>
        {steps.map((step, index) => (
          <li
            key={step.key}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className={cn(
              'h-10 gap-2 px-4 text-sm font-semibold inline-flex shrink-0 items-center rounded-full',
              stateClasses[step.state],
            )}
          >
            {step.state === 'done' ? (
              <span className="size-5 [&_svg]:size-3 flex shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                <Check aria-hidden="true" strokeWidth={3} />
              </span>
            ) : (
              <span className="text-xs tabular-nums opacity-60">{index + 1}</span>
            )}
            <span className="leading-tight flex flex-col">
              <span>{step.label}</span>
              {step.hint !== undefined && (
                <span className="font-medium text-[11px] opacity-70">{step.hint}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
      <span
        aria-hidden="true"
        className="inset-y-0 right-0 w-10 pointer-events-none absolute bg-linear-to-l from-surface to-transparent"
      />
    </div>
  )
}
