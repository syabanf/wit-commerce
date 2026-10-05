import {
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { cn } from '../../lib/cn'
import { rovingIndex } from '../../lib/roving'

export const defaultFormat = (value: number): string => value.toLocaleString()

/** Rough width of an 11px tick label; charts use it to size the y-axis band and thin x labels. */
function textWidth(text: string): number {
  return text.length * 6.2
}

function niceStep(range: number, count: number): number {
  const rough = range / Math.max(1, count)
  const power = 10 ** Math.floor(Math.log10(rough))
  const n = rough / power
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * power
}

const clean = (value: number) => Number.parseFloat(value.toPrecision(12))

/** Rounded domain and tick values (0 / 250 / 500 …) covering `min..max`. */
export function niceScale(
  min: number,
  max: number,
  count: number,
): { min: number; max: number; ticks: number[] } {
  let lo = min
  let hi = max
  if (lo === hi) {
    if (hi > 0) lo = 0
    else if (lo < 0) hi = 0
    else hi = 1
  }
  const step = niceStep(hi - lo, count)
  const start = Math.floor(lo / step) * step
  const end = Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let value = start; value <= end + step / 2; value += step) ticks.push(clean(value))
  return { min: clean(start), max: clean(end), ticks }
}

/** Ticks inside a fixed domain (for a caller-supplied `yDomain`). */
export function ticksWithin(min: number, max: number, count: number): number[] {
  if (!(max > min)) return [min]
  const step = niceStep(max - min, count)
  const ticks: number[] = []
  for (let value = Math.ceil(min / step) * step; value <= max + step / 1e6; value += step)
    ticks.push(clean(value))
  return ticks
}

/**
 * X-axis labels that fit: every n-th label (anchored on the last one), clamped inside the chart,
 * and skipped when a clamped label would touch the label already placed to its right.
 */
export function xAxisLabels(
  labels: string[],
  xAt: (index: number) => number,
  spacing: number,
  width: number,
): { index: number; x: number; text: string }[] {
  const gap = 8
  const widest = Math.max(0, ...labels.map(textWidth)) + gap
  const every = Math.max(1, Math.ceil(widest / Math.max(1, spacing)))
  const shown: { index: number; x: number; text: string }[] = []
  let leftEdge = Number.POSITIVE_INFINITY
  for (let index = labels.length - 1; index >= 0; index -= every) {
    const text = labels[index] ?? ''
    const half = textWidth(text) / 2
    const x = Math.min(Math.max(xAt(index), half), width - half)
    if (x + half + gap > leftEdge) continue
    shown.push({ index, x, text })
    leftEdge = x - half
  }
  return shown
}

/** Width of the y-axis label band for the given tick labels. */
export function axisWidth(tickLabels: string[]): number {
  return Math.ceil(Math.max(0, ...tickLabels.map(textWidth))) + 10
}

type YGridProps = {
  ticks: number[]
  labels: string[]
  y: (value: number) => number
  left: number
  right: number
}

/** Solid 1px gridlines, one per tick, with the tick labels right-aligned in the axis band. */
export function YGrid({ ticks, labels, y, left, right }: YGridProps) {
  return ticks.map((tick, index) => (
    <g key={tick}>
      <line
        x1={left}
        x2={right}
        y1={y(tick)}
        y2={y(tick)}
        strokeWidth={1}
        shapeRendering="crispEdges"
        className="stroke-border"
      />
      <text
        x={left - 10}
        y={y(tick)}
        dy="0.32em"
        textAnchor="end"
        className="fill-muted text-[11px] tabular-nums"
      >
        {labels[index]}
      </text>
    </g>
  ))
}

export function XLabels({ labels, y }: { labels: ReturnType<typeof xAxisLabels>; y: number }) {
  return labels.map((label) => (
    <text
      key={label.index}
      x={label.x}
      y={y}
      textAnchor="middle"
      className="fill-muted text-[11px] tabular-nums"
    >
      {label.text}
    </text>
  ))
}

type ReferenceLineProps = { y: number; left: number; right: number; label: string; className: string }

/** Horizontal 1px threshold line with a small right-aligned label above it. */
export function ReferenceLine({ y, left, right, label, className }: ReferenceLineProps) {
  return (
    <g className="pointer-events-none">
      <line
        x1={left}
        x2={right}
        y1={y}
        y2={y}
        strokeWidth={1}
        shapeRendering="crispEdges"
        className={className}
      />
      <text x={right} y={y - 5} textAnchor="end" className="fill-muted text-[11px]">
        {label}
      </text>
    </g>
  )
}

/**
 * Column path with a 4px rounded data end and a square baseline end.
 * Grows up from `baseY` when `valueY` is above it, down otherwise.
 */
export function columnPath(x: number, width: number, baseY: number, valueY: number, radius = 4): string {
  const r = Math.max(0, Math.min(radius, width / 2, Math.abs(baseY - valueY)))
  const right = x + width
  if (valueY <= baseY) {
    return `M${x},${baseY}V${valueY + r}A${r},${r} 0 0 1 ${x + r},${valueY}H${right - r}A${r},${r} 0 0 1 ${right},${valueY + r}V${baseY}Z`
  }
  return `M${x},${baseY}V${valueY - r}A${r},${r} 0 0 0 ${x + r},${valueY}H${right - r}A${r},${r} 0 0 0 ${right},${valueY - r}V${baseY}Z`
}

type ChartTooltipProps = {
  /** Anchor point in chart pixels; the bubble sits above it unless `below`. */
  x: number
  y: number
  containerWidth: number
  value: ReactNode
  label?: ReactNode
  below?: boolean
  onDark?: boolean
}

/** HTML tooltip above the SVG: value first in bold, label second, clamped inside the chart width. */
export function ChartTooltip({
  x,
  y,
  containerWidth,
  value,
  label,
  below = false,
  onDark = false,
}: ChartTooltipProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  // Measures after every render; the equality guard stops the update loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const measured = ref.current?.offsetWidth ?? 0
    if (measured !== width) setWidth(measured)
  })

  const half = width / 2
  const left = width > 0 && containerWidth > width ? Math.min(Math.max(x, half), containerWidth - half) : x

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{ left, top: y, transform: `translate(-50%, ${below ? '10px' : 'calc(-100% - 10px)'})` }}
      className={cn(
        'rounded-xl px-2.5 py-1.5 text-xs leading-tight pointer-events-none absolute z-10 bg-ink whitespace-nowrap text-on-ink shadow-float',
        onDark && 'ring-white/15 ring-1',
      )}
    >
      <div className="font-semibold tabular-nums">{value}</div>
      {label !== undefined && label !== '' && <div className="text-on-ink-muted">{label}</div>}
    </div>
  )
}

/** Screen reader echo of the hovered or focused value, since the SVG itself is a single image. */
export function LiveValue({ text }: { text: string }) {
  return (
    <span className="sr-only" aria-live="polite">
      {text}
    </span>
  )
}

/** Crosshair keys stop at the ends instead of wrapping. */
function stepTo(key: string, from: number, count: number): number | null {
  switch (key) {
    case 'ArrowRight':
      return Math.min(count - 1, from + 1)
    case 'ArrowLeft':
      return Math.max(0, from - 1)
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

/**
 * Crosshair state for line charts: the pointer snaps to the nearest x, and the focused chart
 * steps through points with the arrow keys (Home and End jump to the ends).
 */
export function useCrosshair(count: number, indexAt: (x: number) => number) {
  const [active, setActive] = useState<number | null>(null)
  const current = active !== null && active < count ? active : null

  const bind = {
    tabIndex: count > 0 ? 0 : -1,
    onPointerMove: (event: PointerEvent<SVGSVGElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      setActive(indexAt(event.clientX - rect.left))
    },
    onPointerLeave: () => setActive(null),
    onFocus: () => setActive((prev) => prev ?? count - 1),
    onBlur: () => setActive(null),
    onKeyDown: (event: KeyboardEvent<SVGSVGElement>) => {
      if (count === 0) return
      const next = stepTo(event.key, current ?? count - 1, count)
      if (next === null) return
      event.preventDefault()
      setActive(next)
    },
  }

  return [current, bind] as const
}

/**
 * Hover and keyboard state for discrete marks (bars, columns, donut segments). One mark is in
 * the tab order at a time; arrow keys move focus between marks.
 */
export function useActiveMark(count: number, initial: number) {
  const [active, setActive] = useState<number | null>(null)
  const current = active !== null && active < count ? active : null
  const tabStop = current ?? Math.min(Math.max(initial, 0), count - 1)

  const markProps = (index: number) => ({
    tabIndex: index === tabStop ? 0 : -1,
    'data-mark': index,
    onPointerEnter: () => setActive(index),
    onFocus: () => setActive(index),
  })

  const groupProps = {
    onPointerLeave: () => setActive(null),
    onBlur: (event: FocusEvent<SVGGElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActive(null)
    },
    onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
      const next = rovingIndex(event.key, tabStop, count, () => true)
      if (next === null) return
      event.preventDefault()
      event.currentTarget.querySelector<SVGElement>(`[data-mark="${next}"]`)?.focus()
    },
  }

  return { active: current, markProps, groupProps }
}
