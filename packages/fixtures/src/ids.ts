export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${Date.now().toString(36).slice(-4)}${rand}`
}

/**
 * Next sequential code after the highest existing one with the same prefix.
 * nextCode(['WO-2026-002819'], 'WO-2026-', 6) → 'WO-2026-002820'
 */
export function nextCode(existing: readonly string[], prefix: string, digits: number): string {
  let max = 0
  for (const code of existing) {
    if (!code.startsWith(prefix)) continue
    const n = Number(code.slice(prefix.length))
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(digits, '0')}`
}
