import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react'

/**
 * A list reordered by dragging a handle, or by its arrow keys. The drop place is how many other rows
 * sit above the pointer. `onMove` gets the row and its new index; a row with `locked` true stays put.
 */
export function usePointerReorder<T>({
  items,
  keyOf,
  onMove,
  locked = () => false,
}: {
  items: readonly T[]
  keyOf: (item: T) => string
  onMove: (item: T, to: number) => void
  locked?: (item: T) => boolean
}) {
  const [drag, setDrag] = useState<{ key: string; to: number } | null>(null)
  const rows = useRef(new Map<string, HTMLElement>())

  const dropIndex = (key: string, y: number) =>
    items.filter((item) => {
      const el = rows.current.get(keyOf(item))
      if (keyOf(item) === key || !el) return false
      const box = el.getBoundingClientRect()
      return box.top + box.height / 2 < y
    }).length
  const others = drag ? items.filter((item) => keyOf(item) !== drag.key) : []

  return {
    /** The key of the row being dragged. */
    dragging: drag?.key ?? null,
    /** Ref for a row, so the drop place can be measured. */
    rowRef: (item: T) => (el: HTMLElement | null) => {
      if (el) rows.current.set(keyOf(item), el)
      else rows.current.delete(keyOf(item))
    },
    /** Whether the drop line sits above this row. */
    dropBefore: (item: T) =>
      !!drag && others[drag.to] !== undefined && keyOf(others[drag.to]!) === keyOf(item),
    /** Whether the drop line sits below the last row. */
    dropAtEnd: !!drag && drag.to >= others.length,
    /** Handlers for a row's drag handle. */
    handle: (item: T, index: number) => ({
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (locked(item)) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setDrag({ key: keyOf(item), to: index })
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        if (drag) setDrag({ key: drag.key, to: dropIndex(drag.key, e.clientY) })
      },
      onPointerUp: () => {
        if (drag && drag.to !== index) onMove(item, drag.to)
        setDrag(null)
      },
      onPointerCancel: () => setDrag(null),
      onKeyDown: (e: KeyboardEvent) => {
        if (locked(item) || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
        e.preventDefault()
        onMove(item, index + (e.key === 'ArrowUp' ? -1 : 1))
      },
    }),
  }
}
