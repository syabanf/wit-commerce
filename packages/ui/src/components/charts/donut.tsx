import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { ChartTooltip, LiveValue, useActiveMark } from './shared'

export type DonutProps = {
  segments: { key: string; label: string; value: number; color: string }[]
  size?: number
  thickness?: number
  centerValue?: ReactNode
  centerLabel?: ReactNode
  ariaLabel: string
  className?: string
}

// Distance a hovered segment moves outward.
const LIFT = 3
const FULL = Math.PI * 2

function polar(cx: number, r: number, angle: number): string {
  return `${cx + r * Math.cos(angle)},${cx + r * Math.sin(angle)}`
}

/** Ring sector between two angles; a full turn is drawn as two half rings. */
function sectorPath(cx: number, inner: number, outer: number, start: number, end: number): string {
  if (end - start >= FULL - 1e-6) {
    return [
      `M${polar(cx, outer, 0)}A${outer},${outer} 0 1 1 ${polar(cx, outer, Math.PI)}A${outer},${outer} 0 1 1 ${polar(cx, outer, 0)}Z`,
      `M${polar(cx, inner, 0)}A${inner},${inner} 0 1 0 ${polar(cx, inner, Math.PI)}A${inner},${inner} 0 1 0 ${polar(cx, inner, 0)}Z`,
    ].join('')
  }
  const large = end - start > Math.PI ? 1 : 0
  return `M${polar(cx, outer, start)}A${outer},${outer} 0 ${large} 1 ${polar(cx, outer, end)}L${polar(cx, inner, end)}A${inner},${inner} 0 ${large} 0 ${polar(cx, inner, start)}Z`
}

/** Part-to-whole ring. Callers render their own legend. */
export function Donut({
  segments,
  size = 148,
  thickness = 16,
  centerValue,
  centerLabel,
  ariaLabel,
  className,
}: DonutProps) {
  const visible = segments.filter((segment) => segment.value > 0)
  const total = visible.reduce((sum, segment) => sum + segment.value, 0)
  const { active, markProps, groupProps } = useActiveMark(visible.length, 0)

  const cx = size / 2
  const outer = cx - LIFT - 1
  const inner = Math.max(0, outer - thickness)
  // A 2px gap measured along the middle of the ring.
  const gap = visible.length > 1 ? 2 / ((outer + inner) / 2) : 0

  let cursor = -Math.PI / 2
  const arcs = visible.map((segment) => {
    const sweep = (segment.value / total) * FULL
    const start = cursor + gap / 2
    const end = Math.max(start + 0.001, cursor + sweep - gap / 2)
    cursor += sweep
    return { ...segment, start, end, mid: (start + end) / 2 }
  })

  const activeArc = active === null ? undefined : arcs[active]
  const percent = (value: number) => Math.round((value / total) * 100)

  return (
    <div className={cn('relative inline-block shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={ariaLabel} className="block overflow-visible">
        {arcs.length === 0 ? (
          <path d={sectorPath(cx, inner, outer, 0, FULL)} fillRule="evenodd" className="fill-surface" />
        ) : (
          <g {...groupProps}>
            {arcs.map((arc, index) => {
              const lifted = index === active
              return (
                <path
                  key={arc.key}
                  d={sectorPath(cx, inner, outer, arc.start, arc.end)}
                  fillRule="evenodd"
                  style={{ fill: arc.color }}
                  // A transparent stroke widens the hit band past 24px without painting anything.
                  stroke="transparent"
                  strokeWidth={Math.max(0, 24 - thickness)}
                  transform={
                    lifted ? `translate(${LIFT * Math.cos(arc.mid)} ${LIFT * Math.sin(arc.mid)})` : undefined
                  }
                  className="outline-none"
                  {...markProps(index)}
                />
              )
            })}
          </g>
        )}
      </svg>
      {(centerValue !== undefined || centerLabel !== undefined) && (
        <div className="inset-0 pointer-events-none absolute flex flex-col items-center justify-center text-center">
          {centerValue !== undefined && (
            <div className="text-2xl font-bold tracking-tight leading-none">{centerValue}</div>
          )}
          {centerLabel !== undefined && (
            <div className="mt-1 font-medium text-[0.6875rem] text-muted">{centerLabel}</div>
          )}
        </div>
      )}
      {activeArc && (
        <ChartTooltip
          x={cx + (outer + LIFT) * Math.cos(activeArc.mid)}
          y={cx + (outer + LIFT) * Math.sin(activeArc.mid)}
          below={Math.sin(activeArc.mid) > 0.35}
          containerWidth={size}
          value={`${activeArc.value.toLocaleString()} (${percent(activeArc.value)}%)`}
          label={activeArc.label}
        />
      )}
      <LiveValue
        text={activeArc ? `${activeArc.label}: ${activeArc.value} (${percent(activeArc.value)}%)` : ''}
      />
    </div>
  )
}
