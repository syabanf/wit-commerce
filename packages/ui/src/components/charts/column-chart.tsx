import { cn } from '../../lib/cn'
import { useElementSize } from '../../lib/use-element-size'
import {
  ChartTooltip,
  LiveValue,
  ReferenceLine,
  XLabels,
  YGrid,
  axisWidth,
  columnPath,
  defaultFormat,
  niceScale,
  useActiveMark,
  xAxisLabels,
} from './shared'

const fills = { ink: 'fill-ink', info: 'fill-info', muted: 'fill-chart-muted' } as const

export type ColumnChartProps = {
  data: { label: string; value: number; highlight?: boolean }[]
  /** Total height, x-axis labels included. */
  height?: number
  format?: (value: number) => string
  /** Colour of the columns that are not highlighted; `muted` gives the emphasis form. */
  tone?: keyof typeof fills
  yTicks?: number
  referenceLine?: { value: number; label: string }
  ariaLabel: string
  className?: string
}

const X_BAND = 22
// Room above the tallest column for its value label.
const TOP = 18

export function ColumnChart({
  data,
  height = 200,
  format = defaultFormat,
  tone = 'ink',
  yTicks = 4,
  referenceLine,
  ariaLabel,
  className,
}: ColumnChartProps) {
  const [sizeRef, size] = useElementSize<HTMLDivElement>()
  const width = Math.floor(size.width)
  const count = data.length
  const firstHighlight = data.findIndex((d) => d.highlight)
  const { active, markProps, groupProps } = useActiveMark(
    count,
    firstHighlight >= 0 ? firstHighlight : count - 1,
  )

  const values = data.map((d) => d.value)
  const reference = referenceLine?.value ?? 0
  const scale = niceScale(Math.min(0, reference, ...values), Math.max(0, reference, ...values), yTicks)
  const tickLabels = scale.ticks.map(format)
  const left = axisWidth(tickLabels)
  const bottom = height - X_BAND
  const y = (value: number) => TOP + ((scale.max - value) / (scale.max - scale.min)) * (bottom - TOP)
  const baseY = y(0)

  const slot = count > 0 ? (width - left) / count : 0
  const barWidth = Math.max(1, Math.min(24, slot - 2))
  const center = (index: number) => left + index * slot + slot / 2
  const xLabels = xAxisLabels(
    data.map((d) => d.label),
    center,
    slot,
    width,
  )

  const activeItem = active === null ? undefined : data[active]

  return (
    <div ref={sizeRef} className={cn('relative w-full', className)} style={{ height }}>
      {width > 0 && count === 0 && (
        <p className="text-sm flex h-full items-center justify-center text-muted">No data</p>
      )}
      {width > 0 && count > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          className="block overflow-visible"
        >
          <YGrid ticks={scale.ticks} labels={tickLabels} y={y} left={left} right={width} />

          <g {...groupProps}>
            {data.map((item, index) => {
              const top = y(item.value)
              return (
                <g key={index}>
                  <path
                    d={columnPath(center(index) - barWidth / 2, barWidth, baseY, top)}
                    className={cn(
                      item.highlight ? 'fill-accent' : fills[tone],
                      active === index && 'opacity-80',
                    )}
                  />
                  {item.highlight && (
                    <text
                      x={center(index)}
                      y={Math.min(top, baseY) - 6}
                      textAnchor="middle"
                      className="font-semibold fill-foreground text-[0.6875rem] tabular-nums"
                    >
                      {format(item.value)}
                    </text>
                  )}
                  {/* Full-slot hit target, larger than the painted column. */}
                  <rect
                    x={left + index * slot}
                    y={TOP}
                    width={slot}
                    height={bottom - TOP}
                    fill="transparent"
                    className="outline-none"
                    {...markProps(index)}
                  />
                </g>
              )
            })}
          </g>

          {referenceLine && (
            <ReferenceLine
              y={y(referenceLine.value)}
              left={left}
              right={width}
              label={referenceLine.label}
              className="stroke-muted"
            />
          )}
          <XLabels labels={xLabels} y={height - 6} />
        </svg>
      )}
      {activeItem && active !== null && (
        <ChartTooltip
          x={center(active)}
          y={Math.min(y(activeItem.value), baseY)}
          containerWidth={width}
          value={format(activeItem.value)}
          label={activeItem.label}
        />
      )}
      <LiveValue text={activeItem ? `${activeItem.label}: ${format(activeItem.value)}` : ''} />
    </div>
  )
}
