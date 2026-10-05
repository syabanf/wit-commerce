import type { Collection } from '@rc/types'

/** "Trail season" → "trail-season". */
export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const joinOr = (items: readonly string[]) =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`

/** "Category Trail shoes or tag carbon plate", for smart collections; "Hand-picked" for manual ones. */
export function ruleSummary(
  c: Pick<Collection, 'mode' | 'ruleCategoryIds' | 'ruleTags'>,
  categoryName: (id: string) => string,
): string {
  if (c.mode === 'manual') return 'Hand-picked'
  const parts = [
    c.ruleCategoryIds.length &&
      `${c.ruleCategoryIds.length > 1 ? 'Categories' : 'Category'} ${joinOr(c.ruleCategoryIds.map(categoryName))}`,
    c.ruleTags.length && `${c.ruleTags.length > 1 ? 'tags' : 'tag'} ${joinOr(c.ruleTags)}`,
  ].filter((p): p is string => !!p)
  const text = parts.join(' or ')
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'No rules yet'
}
