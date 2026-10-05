/**
 * Next index for arrow-key navigation in a tablist or radio group, skipping disabled entries
 * and wrapping at the ends. Returns null for keys it does not handle.
 */
export function rovingIndex(
  key: string,
  current: number,
  count: number,
  isEnabled: (index: number) => boolean,
  vertical = false,
): number | null {
  let step: 1 | -1
  let from = current
  if (key === 'ArrowRight' || (vertical && key === 'ArrowDown')) step = 1
  else if (key === 'ArrowLeft' || (vertical && key === 'ArrowUp')) step = -1
  else if (key === 'Home') {
    step = 1
    from = -1
  } else if (key === 'End') {
    step = -1
    from = count
  } else return null

  for (let n = 1; n <= count; n++) {
    const index = (((from + step * n) % count) + count) % count
    if (isEnabled(index)) return index
  }
  return null
}
