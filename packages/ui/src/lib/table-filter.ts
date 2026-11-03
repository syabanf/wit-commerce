/** True when every word of the query appears in one of the fields, ignoring case. An empty query matches. */
export function matchesQuery(
  query: string,
  ...fields: ReadonlyArray<string | number | null | undefined>
): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const text = fields
    .filter((field) => field != null)
    .join(' ')
    .toLowerCase()
  return words.every((word) => text.includes(word))
}

/** Rows per value, for the counts on filter chips. Rows whose key is null or undefined are left out. */
export function countBy<T, K extends string>(
  rows: readonly T[],
  key: (row: T) => K | null | undefined,
): Partial<Record<K, number>> {
  const counts: Partial<Record<K, number>> = {}
  for (const row of rows) {
    const value = key(row)
    if (value != null) counts[value] = (counts[value] ?? 0) + 1
  }
  return counts
}
