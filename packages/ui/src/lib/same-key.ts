/** Compares reset keys: primitives by identity, arrays element by element (so `[tab, filter]` works inline). */
export function sameKey(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  return (
    Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  )
}
