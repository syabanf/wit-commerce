import type { ShopSearchFacets, ShopSearchResult } from '@rc/api'
import type { Product } from '@rc/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '../lib/api'
import type { Catalog, SortKey } from '../lib/catalog'
import {
  type SearchState,
  activeFilters,
  facetsFrom,
  readSearch,
  searchRequest,
  selectedFrom,
  toggled,
  writeSearch,
} from '../lib/search'
import type { ListingState } from './listing'

const PAGE_SIZE = 24
export interface SearchListing {
  listing: ListingState
  facets: ShopSearchFacets | null
  suggestion: string | null
  /** True until the first answer for this search arrives. */
  loading: boolean
  failed: boolean
  retry: () => void
}

/**
 * The search page's results from the API: the URL holds the words, category, sort and filters, the
 * API answers one page at a time with facets, and "show more" appends the next page.
 */
export function useSearchListing(store: string, catalog: Catalog): SearchListing {
  const [params, setParams] = useSearchParams()
  const search = useMemo(() => readSearch(params), [params])
  const key = writeSearch(search).toString()
  const [answer, setAnswer] = useState<{ key: string; result: ShopSearchResult; products: Product[] } | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const latest = useRef(key)
  latest.current = key

  useEffect(() => {
    let live = true
    api.shop
      .search(store, searchRequest(search, 1, PAGE_SIZE))
      .then((result) => {
        if (!live) return
        setAnswer({ key, result, products: result.products })
        setFailedKey(null)
      })
      .catch(() => {
        if (live) setFailedKey(key)
      })
    return () => {
      live = false
    }
    // search follows key; attempt reruns the same search after a failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, key, attempt])

  const result = answer?.result ?? null
  const current = answer?.key === key
  const facets = useMemo(() => facetsFrom(result?.facets ?? null, catalog.attributes), [result, catalog.attributes])
  const go = useCallback(
    (next: SearchState) => setParams(writeSearch(next), { replace: true, preventScrollReset: true }),
    [setParams],
  )
  const loadMore = useCallback(() => {
    if (!answer || loadingMore) return
    setLoadingMore(true)
    api.shop
      .search(store, searchRequest(search, answer.result.page + 1, PAGE_SIZE))
      .then((more) => {
        if (latest.current !== answer.key) return
        setAnswer({ key: answer.key, result: more, products: [...answer.products, ...more.products] })
      })
      // The button stays, so the shopper can ask again.
      .catch(() => undefined)
      .finally(() => setLoadingMore(false))
  }, [answer, loadingMore, search, store])

  const listing: ListingState = {
    sort: search.sort ?? (search.q ? 'featured' : 'best'),
    setSort: (sort: SortKey) => go({ ...search, sort }),
    facets,
    selected: selectedFrom(search, facets),
    toggle: (defId, value) => {
      const def = facets.find((f) => f.def.id === defId)?.def
      if (def) go(toggled(search, def, value))
    },
    setMax: (defId, value) => {
      const def = facets.find((f) => f.def.id === defId)?.def
      if (def) go({ ...search, attrs: { ...search.attrs, [def.code]: value ? [value] : [] } })
    },
    clear: () => go({ ...search, attrs: {}, price: null, inStock: false }),
    activeCount: activeFilters(search),
    // Results of the previous search stay on screen while the next one loads.
    results: answer?.products ?? [],
    total: result?.total ?? 0,
    loadMore: current && result && result.page < result.pages ? loadMore : undefined,
    loadingMore,
  }
  return {
    listing,
    facets: result?.facets ?? null,
    suggestion: current ? (result?.suggestion ?? null) : null,
    loading: !current && failedKey !== key,
    failed: failedKey === key && !current,
    retry: () => setAttempt((n) => n + 1),
  }
}
