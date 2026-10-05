import { useId } from 'react'
import { cn } from '../../lib/cn'
import { useElementSize } from '../../lib/use-element-size'
import {
  ChartTooltip,
  LiveValue,
  ReferenceLine,
  XLabels,
  YGrid,
  axisWidth,
  defaultFormat,
  niceScale,
  ticksWithin,
  useCrosshair,
  xAxisLabels,
} from './shared'

const tones = {
  ink: { line: 'stroke-ink', area: 'fill-ink/10', dot: 'fill-ink' },
  info: { line: 'stroke-info', area: 'fill-info/10', dot: 'fill-info' },
  accent: { line: 'stroke-accent', area: 'fill-accent/10', dot: 'fill-accent' },
} as const

const zoneFills = { success: 'fill-success/8', warning: 'fill-warning/8', danger: 'fill-accent/8' } as const
const referenceStrokes = {
  warning: 'stroke-warning',
  danger: 'stroke-accent',
  muted: 'stroke-muted',
} as const

export type LineChartProps = {
  /** `null` values break the line. */
  data: { label: string; value: number | null }[]
  /** Total height, x-axis labels included. */
  height?: number
  format?: (value: number) => string
  tone?: keyof typeof tones
  area?: boolean
  /** Horizontal threshold bands, drawn at about 8% opacity. */
  zones?: { from: number; to: number; tone: keyof typeof zoneFills }[]
  referenceLines?: { value: number; label: string; tone?: keyof typeof referenceStrokes }[]
  yDomain?: [number, number]
  showDots?: boolean
  ariaLabel: string
  className?: string
}

const X_BAND = 22
const TOP = 12
// Room for the end dot and its ring at the right edge.
const RIGHT = 6

type Point = { x: number; y: number; index: number; value: number }

export function LineChart({
  data,
  height = 200,
  format = defaultFormat,
  tone = 'ink',
  area = false,
  zones = [],
  referenceLines = [],
  yDomain,
  showDots = false,
  ariaLabel,
  className,
}: LineChartProps) {
  const [sizeRef, size] = useElementSize<HTMLDivElement>()
  const clipId = `line-clip-${useId().replace(/[^\w-]/g, '')}`
  const width = Math.floor(size.width)
  const count = data.length
  const style = tones[tone]

  const values = data.flatMap((d) => (d.value === null ? [] : [d.value]))
  const bounds = [...values, ...referenceLines.map((line) => line.value)]
  const scale = yDomain
    ? { min: yDomain[0], max: yDomain[1], ticks: ticksWithin(yDomain[0], yDomain[1], 4) }
    : niceScale(Math.min(...bounds), Math.max(...bounds), 4)
  const tickLabels = scale.ticks.map(format)
  const left = axisWidth(tickLabels)
  const right = width - RIGHT
  const bottom = height - X_BAND
  const plotWidth = Math.max(0, right - left)
  const spacing = count > 1 ? plotWidth / (count - 1) : 0
  const x = (index: number) => (count > 1 ? left + index * spacing : left + plotWidth / 2)
  const y = (value: number) => TOP + ((scale.max - value) / (scale.max - scale.min || 1)) * (bottom - TOP)

  const [active, bind] = useCrosshair(count, (px) =>
    spacing > 0 ? Math.min(count - 1, Math.max(0, Math.round((px - left) / spacing))) : 0,
  )

  // Split at nulls so gaps in the data stay gaps.
  const segments: Point[][] = [[]]
  data.forEach((d, index) => {
    if (d.value === null) segments.push([])
    else segments[segments.length - 1]?.push({ x: x(index), y: y(d.value), index, value: d.value })
  })
  const runs = segments.filter((segment) => segment.length > 0)
  const pathOf = (points: Point[]) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join('')
  const lastPoint = runs[runs.length - 1]?.at(-1)
  const xLabels = xAxisLabels(
    data.map((d) => d.label),
    x,
    spacing || plotWidth,
    width,
  )

  const activeItem = active === null ? undefined : data[active]
  const activeValue = activeItem?.value ?? null
  const describe = activeItem
    ? `${activeItem.label}: ${activeValue === null ? 'no data' : format(activeValue)}`
    : ''

  const dot = (p: Point, key: string) => (
    <circle key={key} cx={p.x} cy={p.y} r={4} strokeWidth={2} className={cn('stroke-card', style.dot)} />
  )

  return (
    <div ref={sizeRef} className={cn('relative w-full', className)} style={{ height }}>
      {width > 0 && values.length === 0 && (
        <p className="text-sm flex h-full items-center justify-center text-muted">No data</p>
      )}
      {width > 0 && values.length > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          className="rounded-md block overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          {...bind}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={left} y={TOP - 3} width={plotWidth + RIGHT} height={bottom - TOP + 6} />
            </clipPath>
          </defs>

          {zones.map((zone, index) => {
            const top = y(Math.min(zone.to, scale.max))
            const base = y(Math.max(zone.from, scale.min))
            return base > top ? (
              <rect
                key={index}
                x={left}
                y={top}
                width={plotWidth}
                height={base - top}
                className={zoneFills[zone.tone]}
              />
            ) : null
          })}

          <YGrid ticks={scale.ticks} labels={tickLabels} y={y} left={left} right={right} />

          {referenceLines.map((line, index) => (
            <ReferenceLine
              key={index}
              y={y(line.value)}
              left={left}
              right={right}
              label={line.label}
              className={referenceStrokes[line.tone ?? 'muted']}
            />
          ))}

          <g clipPath={`url(#${clipId})`}>
            {area &&
              runs.map((run, index) => {
                const first = run[0]
                const last = run[run.length - 1]
                return first && last && run.length > 1 ? (
                  <path
                    key={index}
                    d={`${pathOf(run)}L${last.x},${bottom}L${first.x},${bottom}Z`}
                    className={style.area}
                  />
                ) : null
              })}
            {runs.map((run, index) => (
              <path
                key={index}
                d={pathOf(run)}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={style.line}
              />
            ))}
          </g>

          {active !== null && (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={TOP}
              y2={bottom}
              strokeWidth={1}
              className="stroke-foreground/25"
            />
          )}

          {/* Isolated points (and every point with showDots) get a marker; the last point always does. */}
          {runs.flatMap((run) =>
            run
              .filter((p) => p !== lastPoint && (showDots || run.length === 1))
              .map((p) => dot(p, `dot-${p.index}`)),
          )}
          {lastPoint && dot(lastPoint, 'last')}
          {lastPoint && (
            <text
              x={lastPoint.x - 8}
              y={lastPoint.y - 8 < TOP + 4 ? lastPoint.y + 18 : lastPoint.y - 8}
              textAnchor="end"
              className="font-semibold fill-foreground text-[0.6875rem] tabular-nums"
            >
              {format(lastPoint.value)}
            </text>
          )}
          {active !== null &&
            activeValue !== null &&
            dot({ x: x(active), y: y(activeValue), index: active, value: activeValue }, 'active')}

          <XLabels labels={xLabels} y={height - 6} />
        </svg>
      )}
      {activeItem && active !== null && (
        <ChartTooltip
          x={x(active)}
          y={activeValue === null ? TOP : y(activeValue)}
          containerWidth={width}
          value={activeValue === null ? 'No data' : format(activeValue)}
          label={activeItem.label}
        />
      )}
      <LiveValue text={describe} />
    </div>
  )
}
