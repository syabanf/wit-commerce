import { toMs } from '@rc/fixtures'
import { cn } from '@rc/ui'
import { useNow } from '../state/shop'

const DAY = 86_400_000

/** Four boxes ticking down to `endAt`: days, hours, minutes, seconds. */
export function Countdown({
  endAt,
  className,
  boxClassName,
}: {
  endAt: string
  className?: string
  boxClassName?: string
}) {
  const now = useNow(1000)
  const left = Math.max(0, toMs(endAt) - now)
  const parts: [string, number][] = [
    ['Days', Math.floor(left / DAY)],
    ['Hours', Math.floor((left % DAY) / 3_600_000)],
    ['Min', Math.floor((left % 3_600_000) / 60_000)],
    ['Sec', Math.floor((left % 60_000) / 1000)],
  ]
  return (
    <div
      className={cn('gap-2 flex', className)}
      role="timer"
      aria-label={`Ends in ${parts[0]![1]} days and ${parts[1]![1]} hours`}
    >
      {parts.map(([label, value]) => (
        <div
          key={label}
          aria-hidden="true"
          className={cn(
            'min-w-14 rounded-2xl px-2 py-2 flex flex-col items-center bg-[var(--sf-text)] text-[color:var(--sf-bg)]',
            boxClassName,
          )}
        >
          <span className="text-xl font-bold tabular-nums">{String(value).padStart(2, '0')}</span>
          <span className="tracking-wider text-[10px] uppercase opacity-70">{label}</span>
        </div>
      ))}
    </div>
  )
}
