import { cn } from '../../lib/cn'
import { useElementSize } from '../../lib/use-element-size'
import { ChartTooltip, LiveValue, defaultFormat, useCrosshair } from './shared'

const tones = {
  ink: { line: 'stroke-ink', area: 'fill-ink/10', dot: 'fill-ink', cross: 'stroke-border' },
  accent: { line: 'stroke-accent', area: 'fill-accent/10', dot: 'fill-accent', cross: 'stroke-border' },
  info: { line: 'stroke-info', area: 'fill-info/10', dot: 'fill-info', cross: 'stroke-border' },
  white: { line: 'stroke-white', area: 'fill-white/10', dot: 'fill-white', cross: 'stroke-white/30' },
} as const

export type SparklineProps = {
  data: number[]
  labels?: string[]
  height?: number
  tone?: keyof typeof tones
  area?: boolean
  /** Paint the end dot in accent. */
  highlightLast?: boolean
  format?: (value: number) => string
  ariaLabel: string
  className?: string
}

// Room for the 4px end dot plus its 2px ring.
const PAD = 6

/** Axis-free trend line with a snapping crosshair. */
export function Sparkline({
  data,
  labels,
  height = 40,
  tone = 'ink',
  area = false,
  highlightLast = false,
  format = defaultFormat,
  ariaLabel,
  className,
}: SparklineProps) {
  const [sizeRef, size] = useElementSize<HTMLDivElement>()
  const width = Math.floor(size.width)
  const count = data.length
  const style = tones[tone]

  const min = Math.min(...data)
  const max = Math.max(...data)
  const step = count > 1 ? (width - PAD * 2) / (count - 1) : 0
  const xAt = (index: number) => (count > 1 ? PAD + index * step : width / 2)
  const yAt = (value: number) =>
    max === min ? height / 2 : PAD + ((max - value) / (max - min)) * (height - PAD * 2)

  const [active, bind] = useCrosshair(count, (x) =>
    step > 0 ? Math.min(count - 1, Math.max(0, Math.round((x - PAD) / step))) : 0,
  )

  const points = data.map((value, index) => ({ x: xAt(index), y: yAt(value) }))
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join('')
  const first = points[0]
  const last = points[count - 1]
  const focus = active === null ? undefined : points[active]
  const describe = (index: number) => [format(data[index] ?? 0), labels?.[index]].filter(Boolean).join(', ')

  return (
    <div ref={sizeRef} className={cn('relative w-full', className)} style={{ height }}>
      {width > 0 && first && last && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          className="rounded-md block overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          {...bind}
        >
          {area && <path d={`${line}L${last.x},${height}L${first.x},${height}Z`} className={style.area} />}
          <path
            d={line}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={style.line}
          />
          {focus && (
            <line x1={focus.x} x2={focus.x} y1={0} y2={height} strokeWidth={1} className={style.cross} />
          )}
          <circle
            cx={last.x}
            cy={last.y}
            r={4}
            strokeWidth={2}
            className={cn('stroke-card', highlightLast ? 'fill-accent' : style.dot)}
          />
          {focus && focus !== last && (
            <circle
              cx={focus.x}
              cy={focus.y}
              r={4}
              strokeWidth={2}
              className={cn('stroke-card', style.dot)}
            />
          )}
        </svg>
      )}
      {focus && active !== null && (
        <ChartTooltip
          x={focus.x}
          y={focus.y}
          containerWidth={width}
          value={format(data[active] ?? 0)}
          label={labels?.[active]}
          onDark={tone === 'white'}
        />
      )}
      <LiveValue text={active === null ? '' : describe(active)} />
    </div>
  )
}
