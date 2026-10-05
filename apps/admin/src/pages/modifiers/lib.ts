import { fmtIdr } from '@rc/fixtures'
import type { ModifierGroup } from '@rc/types'
import { MODIFIER_SELECTION_LABEL } from '@rc/types'

/** "+Rp 25.000", or "Free" for choices that cost nothing. */
export const priceDelta = (value: number) => (value ? `+${fmtIdr(value)}` : 'Free')

/** "Pick one · Required", "Pick up to 3". */
export function selectionRule(g: ModifierGroup) {
  const base = g.selection === 'single' ? MODIFIER_SELECTION_LABEL.single : `Pick up to ${g.maxChoices}`
  return g.required ? `${base} · Required` : `${base} · Optional`
}
