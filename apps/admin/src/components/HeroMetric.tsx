/** Number on an ink hero, with its unit muted at the baseline. Shared by every detail hero. */
export function HeroMetric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold tracking-wider text-[0.6875rem] text-on-ink-muted uppercase">{label}</p>
      <p className="mt-1 gap-1.5 flex items-end leading-none">
        <span className="text-2xl font-bold tracking-tight sm:text-3xl truncate tabular-nums">{value}</span>
        {unit && <span className="pb-0.5 text-xs font-semibold shrink-0 text-on-ink-muted">{unit}</span>}
      </p>
    </div>
  )
}
