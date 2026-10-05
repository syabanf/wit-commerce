import { LOOK_HERO_LABEL, LOOK_PRODUCTS_LABEL, type TemplateLook, lookFor } from '@rc/fixtures'
import type { SectionKind, Template } from '@rc/types'
import { SECTION_KIND_LABEL } from '@rc/types'
import { cn } from '@rc/ui'
import { Lock } from 'lucide-react'

const GAP: Record<TemplateLook['spacing'], string> = {
  airy: 'space-y-3',
  regular: 'space-y-1.5',
  dense: 'space-y-1',
}

const HEIGHT: Partial<Record<SectionKind, string>> = {
  comparison: 'h-6',
  brand_story: 'h-6',
  footer: 'h-3',
}

/** The hero as the storefront draws it for this template's look. */
function HeroSketch({ hero }: { hero: TemplateLook['hero'] }) {
  if (hero === 'immersive')
    return (
      <div className="h-16 p-2 gap-1 rounded-md flex flex-col justify-end bg-ink">
        <span className="h-2 w-1/2 rounded-full bg-on-ink/80" />
        <span className="h-1.5 w-1/3 rounded-full bg-on-ink/50" />
      </div>
    )
  if (hero === 'offer')
    return (
      <div className="h-12 rounded-md flex overflow-hidden bg-accent-soft">
        <span className="font-black flex w-1/4 items-center justify-center border-r-2 border-dashed border-accent/40 text-[11px] text-accent">
          %
        </span>
        <span className="p-2 gap-1 flex flex-1 flex-col justify-center">
          <span className="h-2 w-3/4 rounded-full bg-accent/50" />
          <span className="h-1.5 w-1/2 rounded-full bg-accent/30" />
        </span>
      </div>
    )
  if (hero === 'compact')
    return (
      <div className="h-6 px-1.5 gap-2 rounded-md flex items-center justify-between bg-accent-soft">
        <span className="h-1.5 w-1/3 rounded-full bg-accent/50" />
        <span className="h-4 rounded w-1/4 bg-accent/30" />
      </div>
    )
  return <div className="h-10 rounded-md bg-accent-soft" />
}

/** Product sections as rail, feature or grid. */
function ProductsSketch({ layout }: { layout: TemplateLook['products'] }) {
  if (layout === 'feature')
    return (
      <div className="h-12 gap-1 grid grid-cols-3 grid-rows-2">
        <span className="rounded col-span-2 row-span-2 bg-card" />
        <span className="rounded bg-card" />
        <span className="rounded bg-card" />
      </div>
    )
  if (layout === 'grid')
    return (
      <div className="gap-1 grid grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="h-3 rounded bg-card" />
        ))}
      </div>
    )
  return (
    <div className="gap-1 grid grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <span key={i} className="h-6 rounded bg-card" />
      ))}
    </div>
  )
}

/** Schematic of a template: its hero, product layout and spacing, then one bar per other section. */
export function TemplateThumb({ template, className }: { template: Template; className?: string }) {
  const look = lookFor(template.id)
  return (
    <div
      role="img"
      aria-label={`${LOOK_HERO_LABEL[look.hero]}, ${LOOK_PRODUCTS_LABEL[look.products]}. Sections: ${template.sections.map((s) => SECTION_KIND_LABEL[s.kind]).join(', ')}`}
      className={cn('rounded-2xl p-3 bg-surface-2', GAP[look.spacing], className)}
    >
      {template.sections.map((s, i) => {
        const lock = s.rule === 'locked' && <Lock className="size-3 text-muted" aria-hidden="true" />
        if (s.kind === 'hero') return <HeroSketch key={i} hero={look.hero} />
        if (s.kind === 'featured_product' || s.kind === 'collection')
          return <ProductsSketch key={i} layout={look.products} />
        return (
          <div
            key={`${s.kind}-${i}`}
            className={cn('rounded-md px-1.5 flex items-center justify-end bg-card', HEIGHT[s.kind] ?? 'h-4')}
          >
            {lock}
          </div>
        )
      })}
    </div>
  )
}
