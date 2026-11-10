import { pageWithDraft, sectionsInOrder } from '@rc/fixtures'
import type { Page, PageDraft, PageSection } from '@rc/types'
import { toast } from '@rc/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useScoped } from '../../state/scoped'
import { type History, pushHistory, redo, startHistory, undo } from './history'
import { seoFor, withOrder } from './lib'

export interface Draft {
  sections: PageSection[]
  seo: Page['seo']
}

export type SaveState = 'saved' | 'saving' | 'error'

const SAVE_DELAY_MS = 800
/** Edits to the same field closer together than this undo as one step. */
const MERGE_MS = 1000

/**
 * The page as the owner edits it: undo and redo in memory, and an automatic save through pages/save
 * shortly after each change. A live page opens with its unpublished changes, and the saves land
 * there too, so shoppers see nothing until the owner publishes. The sections keep the order shown,
 * with search text filled in for them.
 */
export function useDraft(page: Page, pending: PageDraft | null) {
  const { maps, tenant, dispatchAsync } = useScoped()
  const [history, setHistory] = useState<History<Draft>>(() => {
    const content = pageWithDraft(page, pending)
    return startHistory({
      sections: sectionsInOrder(content.sections, maps.template.get(content.templateId) ?? null),
      seo: seoFor(content, tenant),
    })
  })
  const draft = history.present
  const [state, setState] = useState<SaveState>('saved')
  const saved = useRef<Draft>(draft)
  const latest = useRef(draft)
  latest.current = draft
  const note = useRef('Edited in the store editor')
  const last = useRef({ key: '', at: 0 })

  /** Applies a change. `key` names what changed ("sec-1:headline"), so typing merges into one step. */
  const change = useCallback((next: (d: Draft) => Draft, label: string, key = '') => {
    const now = Date.now()
    const merge = !!key && key === last.current.key && now - last.current.at < MERGE_MS
    last.current = { key, at: now }
    note.current = label
    setHistory((h) => pushHistory(h, next(h.present), merge))
  }, [])

  /** Saves the draft now. `force` saves even an unchanged draft, such as search text filled in on open. */
  const save = useCallback(
    async (force = false) => {
      const current = latest.current
      if (current === saved.current && !force) return true
      setState('saving')
      try {
        await dispatchAsync({
          type: 'pages/save',
          id: page.id,
          sections: withOrder(current.sections),
          seo: current.seo,
          note: note.current,
        })
        saved.current = current
        setState(latest.current === current ? 'saved' : 'saving')
        return true
      } catch (err) {
        setState('error')
        toast('Your changes were not saved', {
          tone: 'danger',
          description: err instanceof Error ? err.message : 'The server did not answer. Try again.',
        })
        return false
      }
    },
    [dispatchAsync, page.id],
  )

  useEffect(() => {
    if (draft === saved.current) return
    setState('saving')
    const timer = setTimeout(() => void save(), SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft, save])

  // Leaving the page or the editor still saves the last edit.
  const flush = useRef(save)
  flush.current = save
  useEffect(() => () => void flush.current(), [])

  /** Starts over from content the server already holds, such as a restored version or the live page. */
  const reset = useCallback((sections: PageSection[], seo?: Page['seo']) => {
    const next = { sections, seo: seo ?? latest.current.seo }
    saved.current = next
    setHistory(startHistory(next))
    setState('saved')
  }, [])

  return {
    draft,
    state,
    change,
    save,
    reset,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo: () => {
      note.current = 'Undid a change'
      last.current = { key: '', at: 0 }
      setHistory(undo)
    },
    redo: () => {
      note.current = 'Redid a change'
      last.current = { key: '', at: 0 }
      setHistory(redo)
    },
  }
}
