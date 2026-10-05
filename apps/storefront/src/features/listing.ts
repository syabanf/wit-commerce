import { formatAttribute } from '@rc/fixtures'
import type { AttributeDef, Product } from '@rc/types'
import { useMemo, useState } from 'react'
import { type SortKey, sortProducts } from '../lib/catalog'

export interface FacetOption {
  value: string
  label: string
  count: number
}

/** A filter built from a filterable attribute: checkboxes for choices, "up to" for numbers. */
export interface Facet {
  def: AttributeDef
  kind: 'any' | 'max'
  options: FacetOption[]
}

export interface ListingState {
  sort: SortKey
  setSort: (sort: SortKey) => void
  facets: Facet[]
  selected: Record<string, string[]>
  toggle: (defId: string, value: string) => void
  setMax: (defId: string, value: string | null) => void
  clear: () => void
  activeCount: number
  results: Product[]
}

function buildFacets(products: readonly Product[], defs: readonly AttributeDef[]): Facet[] {
  return defs
    .filter((d) => d.filterable)
    .map((def): Facet => {
      const values = products.map((p) => p.attributes[def.id]).filter((v): v is string => !!v)
      const count = (v: string) => values.filter((x) => x === v).length
      if (def.type === 'number') {
        const distinct = [...new Set(values.map(Number).filter(Number.isFinite))].sort((a, b) => a - b)
        return {
          def,
          kind: 'max',
          options: distinct.map((n) => ({
            value: String(n),
            label: `Up to ${formatAttribute(def, String(n))}`,
            count: values.filter((v) => Number(v) <= n).length,
          })),
        }
      }
      const choices =
        def.type === 'boolean' ? ['yes'] : def.type === 'select' ? def.options : [...new Set(values)]
      return {
        def,
        kind: 'any',
        options: choices
          .map((v) => ({
            value: v,
            label: def.type === 'boolean' ? `With ${def.name.toLowerCase()}` : v,
            count: count(v),
          }))
          .filter((o) => o.count > 0),
      }
    })
    .filter((f) => f.options.length > (f.kind === 'max' ? 1 : 0))
}

function matches(p: Product, facets: Facet[], selected: Record<string, string[]>) {
  return facets.every((f) => {
    const picked = selected[f.def.id]
    if (!picked?.length) return true
    const value = p.attributes[f.def.id]
    if (!value) return false
    return f.kind === 'max' ? Number(value) <= Number(picked[0]) : picked.includes(value)
  })
}

/** Filter and sort state for a product listing. Reset it by keying the page on its category. */
export function useListing(
  products: readonly Product[],
  defs: readonly AttributeDef[],
  initialSort: SortKey = 'featured',
): ListingState {
  const [sort, setSort] = useState<SortKey>(initialSort)
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const facets = useMemo(() => buildFacets(products, defs), [products, defs])
  const results = useMemo(
    () =>
      sortProducts(
        products.filter((p) => matches(p, facets, selected)),
        sort,
      ),
    [products, facets, selected, sort],
  )
  return {
    sort,
    setSort,
    facets,
    selected,
    toggle: (defId, value) =>
      setSelected((s) => {
        const list = s[defId] ?? []
        return { ...s, [defId]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] }
      }),
    setMax: (defId, value) => setSelected((s) => ({ ...s, [defId]: value ? [value] : [] })),
    clear: () => setSelected({}),
    activeCount: Object.values(selected).filter((v) => v.length).length,
    results,
  }
}
