// Deterministic PRNG (mulberry32) so every run of the generator writes identical JSON.
export function createRng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!
  return {
    next,
    int,
    pick,
    float: (min: number, max: number) => next() * (max - min) + min,
    chance: (p: number) => next() < p,
    round: (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits,
    weighted<T>(entries: readonly (readonly [T, number])[]): T {
      const total = entries.reduce((s, [, w]) => s + w, 0)
      let r = next() * total
      for (const [value, weight] of entries) {
        r -= weight
        if (r <= 0) return value
      }
      return entries[entries.length - 1]![0]
    },
  }
}

export const rng = createRng(20261005)
