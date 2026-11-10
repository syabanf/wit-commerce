/** Undo and redo for the store editor: the states before and after the one on screen. */
export interface History<T> {
  past: T[]
  present: T
  future: T[]
}

/** How many earlier states undo can reach. */
export const HISTORY_LIMIT = 50

export const startHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] })

/**
 * Makes `next` the state on screen and clears redo. With `merge`, it replaces the current state
 * instead of adding a step, so typing a word is one undo rather than one per letter.
 */
export function pushHistory<T>(history: History<T>, next: T, merge = false): History<T> {
  if (Object.is(next, history.present)) return history
  if (merge && history.past.length) return { ...history, present: next, future: [] }
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  }
}

export function undo<T>(history: History<T>): History<T> {
  if (!history.past.length) return history
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1]!,
    future: [history.present, ...history.future],
  }
}

export function redo<T>(history: History<T>): History<T> {
  if (!history.future.length) return history
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: history.future[0]!,
    future: history.future.slice(1),
  }
}
