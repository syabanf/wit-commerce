import type { Page } from '@rc/types'
import { FormField, Input, Textarea } from '@rc/ui'
import { ChevronDown } from 'lucide-react'
import type { Change } from './SectionList'

const TITLE_MAX = 60
const DESCRIPTION_MAX = 160

const count = (text: string, max: number) =>
  text.length > max
    ? `${text.length} of ${max} characters. Search engines cut the rest.`
    : `${text.length} of ${max} characters`

/** How the page shows in search results. Filled from the store name and tagline until the owner edits it. */
export function SeoFields({ seo, change }: { seo: Page['seo']; change: Change }) {
  const set = (patch: Partial<Page['seo']>, field: string) =>
    change((d) => ({ ...d, seo: { ...d.seo, ...patch } }), 'Changed the search listing', `seo:${field}`)
  return (
    <details className="group rounded-2xl bg-surface">
      <summary className="min-h-11 gap-2 px-3 text-sm font-medium flex cursor-pointer list-none items-center justify-between">
        Search engines (advanced)
        <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 px-3 pb-3">
        <FormField label="Title in search results" htmlFor="seo-title" hint={count(seo.title, TITLE_MAX)}>
          <Input id="seo-title" value={seo.title} onChange={(e) => set({ title: e.target.value }, 'title')} />
        </FormField>
        <FormField
          label="Description in search results"
          htmlFor="seo-description"
          hint={count(seo.description, DESCRIPTION_MAX)}
        >
          <Textarea
            id="seo-description"
            rows={3}
            value={seo.description}
            onChange={(e) => set({ description: e.target.value }, 'description')}
          />
        </FormField>
      </div>
    </details>
  )
}
