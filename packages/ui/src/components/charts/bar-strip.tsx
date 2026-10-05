import { cn } from '../../lib/cn'
import { useElementSize } from '../../lib/use-element-size'
import { ChartTooltip, LiveValue, columnPath, defaultFormat, useActiveMark } from './shared'

export type BarStripProps = {
  data: { label: string; value: number }[]
  height?: number
  /** Bar drawn in accent; defaults to the last one. */
  highlightIndex?: number
  format?: (value: number) => string
  /** Grey context bars switch to translucent white for ink cards. */
  onInk?: boolean
  ariaLabel: string
  className?: string
}

/** Small axis-free columns: grey context with one accent bar. */
export function BarStrip({
  data,
  height = 56,
  highlightIndex,
  format = defaultFormat,
  onInk = false,
  ariaLabel,
  className,
}: BarStripProps) {
  const [sizeRef, size] = useElementSize<HTMLDivElement>()
  const width = Math.floor(size.width)
  const count = data.length
  const highlight = highlightIndex ?? count - 1
  const { active, markProps, groupProps } = useActiveMark(count, highlight)

  const max = Math.max(0, ...data.map((d) => d.value))
  const slot = count > 0 ? width / count : 0
  const barWidth = Math.max(1, Math.min(24, slot - 2))
  const topOf = (value: number) => height - (max > 0 ? (Math.max(0, value) / max) * height : 0)

  const activeItem = active === null ? undefined : data[active]

  return (
    <div ref={sizeRef} className={cn('relative w-full', className)} style={{ height }}>
      {width > 0 && count > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          className="block overflow-visible"
        >
          <g {...groupProps}>
            {data.map((item, index) => {
              const x = index * slot + (slot - barWidth) / 2
              return (
                <g key={index}>
                  <path
                    d={columnPath(x, barWidth, height, topOf(item.value))}
                    className={cn(
                      index === highlight ? 'fill-accent' : onInk ? 'fill-white/22' : 'fill-chart-muted',
                      active === index && 'opacity-80',
                    )}
                  />
                  {/* Full-slot, full-height hit target, larger than the painted bar. */}
                  <rect
                    x={index * slot}
                    y={0}
                    width={slot}
                    height={height}
                    fill="transparent"
                    className="outline-none"
                    {...markProps(index)}
                  />
                </g>
              )
            })}
          </g>
        </svg>
      )}
      {activeItem && active !== null && (
        <ChartTooltip
          x={active * slot + slot / 2}
          y={topOf(activeItem.value)}
          containerWidth={width}
          value={format(activeItem.value)}
          label={activeItem.label}
          onDark={onInk}
        />
      )}
      <LiveValue text={activeItem ? `${activeItem.label}: ${format(activeItem.value)}` : ''} />
    </div>
  )
}
