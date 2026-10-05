import { fmtIdrShort, formatAttribute } from '@rc/fixtures'
import type { Category, Product } from '@rc/types'
import { type Catalog, categoryIdsUnder, fromPrice, giftable, isBuyable, popularCategories } from './catalog'

// Intent search (spec 20 and 43): read a shopper's sentence in Indonesian or English, then rank the
// catalog against it. Pure functions, no network: answers come from this store's catalog only.

export interface UseCase {
  label: string
  terms: string[]
}

export interface Intent {
  budgetMax: number | null
  categoryId: string | null
  useCases: UseCase[]
  gift: boolean
  giftFor: string | null
  /** Words of the request, Indonesian ones translated, for matching names, tags and attributes. */
  terms: string[]
}

export const EMPTY_INTENT: Intent = {
  budgetMax: null,
  categoryId: null,
  useCases: [],
  gift: false,
  giftFor: null,
  terms: [],
}

// --- budget ---

const AMOUNT = String.raw`(?:rp\.?\s*)?(\d+(?:[.,]\d+)*)\s*(ribu|rb|k|juta|jt)?(?![a-z0-9])`
const TRIGGER = String.raw`(?:budget|bujet|anggaran|maksimal|maksimum|maks|max|under|below|less\s+than|di\s*bawah|kurang\s+dari|up\s+to|sampai|hingga|<=?)\s*`
const TRIGGERED = new RegExp(TRIGGER + AMOUNT, 'i')
// Without a trigger word, only a rupiah amount or an amount with a money unit counts ("10K" is a race).
const BARE =
  /(?:rp\.?\s*(\d+(?:[.,]\d+)*)\s*(ribu|rb|juta|jt)?|(\d+(?:[.,]\d+)?)\s*(ribu|rb|juta|jt))(?![a-z0-9])/i

function toRupiah(num: string, unit: string | undefined): number | null {
  let n: number
  if (/^\d{1,3}(\.\d{3})+$/.test(num) && !unit) n = Number(num.replace(/\./g, ''))
  else if (/^\d{1,3}(,\d{3})+$/.test(num) && !unit) n = Number(num.replace(/,/g, ''))
  else if (num.includes(',')) n = Number(num.replace(/\./g, '').replace(',', '.'))
  else n = Number(num)
  if (!Number.isFinite(n) || n <= 0) return null
  const u = unit?.toLowerCase()
  if (u === 'ribu' || u === 'rb' || u === 'k') return Math.round(n * 1_000)
  if (u === 'juta' || u === 'jt') return Math.round(n * 1_000_000)
  // "budget 500" means 500 ribu; nobody shops under Rp 10.000 here.
  return Math.round(n < 10_000 ? n * 1_000 : n)
}

export function parseBudget(text: string): number | null {
  const t = TRIGGERED.exec(text)
  if (t) return toRupiah(t[1]!, t[2])
  const b = BARE.exec(text)
  if (b) return toRupiah((b[1] ?? b[3])!, b[2] ?? b[4])
  return null
}

// --- words ---

/** Indonesian (and a few English) words mapped to the catalog's English vocabulary. */
const SYNONYMS: Record<string, string[]> = {
  sepatu: ['shoe'],
  lari: ['running'],
  run: ['running'],
  runner: ['running'],
  kaos: ['tee', 'shirt'],
  kaus: ['tee', 'shirt'],
  baju: ['apparel', 'tee'],
  pakaian: ['apparel'],
  celana: ['shorts', 'tights'],
  jaket: ['jacket'],
  topi: ['cap'],
  jam: ['watch'],
  rompi: ['vest'],
  nutrisi: ['nutrition'],
  elektrolit: ['electrolyte'],
  minuman: ['electrolyte', 'drink'],
  pelatih: ['coaching'],
  latihan: ['coaching', 'plan'],
  kulit: ['skin'],
  wajah: ['face'],
  muka: ['face'],
  rambut: ['hair'],
  parfum: ['fragrance', 'parfum'],
  wangi: ['fragrance'],
  perfume: ['fragrance', 'parfum'],
  lipstik: ['lip'],
  bibir: ['lip'],
  pelembab: ['moisturiser', 'moisturizer', 'cream'],
  pembersih: ['cleanser'],
  sabun: ['cleanser'],
  sunblock: ['sunscreen', 'spf'],
  tabir: ['sunscreen', 'spf'],
  spf: ['sunscreen'],
  kompresor: ['compressor', 'compressed'],
  mesin: ['machine'],
  bubut: ['lathe'],
  sparepart: ['spare', 'parts'],
  cadang: ['spare', 'parts'],
  oli: ['oil'],
  bantalan: ['bearing'],
  servis: ['service'],
  perawatan: ['service', 'care'],
  hadiah: ['gift', 'set'],
  kado: ['gift', 'set'],
  gunung: ['trail'],
  sensitif: ['sensitive'],
  kering: ['dry'],
  berminyak: ['oily'],
  pemula: ['beginner'],
}

const STOP = new Set(
  'untuk yang dan atau dengan saya aku mau cari carikan ingin butuh buat ada bisa tolong the for and with need want looking find some any please budget bujet anggaran maksimal maksimum maks max under below less than bawah kurang dari sampai hingga ribu juta rupiah my mine her his ibu ayah pacar istri suami teman kakak adik mama papa bapak mum mom dad wife husband friend'.split(
    ' ',
  ),
)

const stem = (w: string) => (w.length > 4 ? w.replace(/(es|s)$/, '') : w)

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !/\d/.test(w) && !STOP.has(w))
}

function translate(text: string): string[] {
  const lower = text.toLowerCase()
  const out = new Set<string>()
  if (/kaos kaki|kaus kaki/.test(lower)) out.add('sock')
  if (/kulit kepala/.test(lower)) out.add('scalp')
  for (const w of words(text)) {
    const mapped = SYNONYMS[w]
    if (mapped) mapped.forEach((m) => out.add(stem(m)))
    else out.add(stem(w))
  }
  return [...out]
}

// --- use cases and gifts ---

const USE_CASES: { re: RegExp; label: string; terms: string[] }[] = [
  { re: /\b5\s?k\b/i, label: '5K', terms: ['5k'] },
  { re: /\b10\s?k\b/i, label: '10K', terms: ['10k'] },
  { re: /\bhalf\b|setengah maraton|\b21\s?k\b/i, label: 'Half marathon', terms: ['half'] },
  { re: /(?<!half )\b(full )?mara?thon\b|\b42\s?k\b/i, label: 'Marathon', terms: ['marathon'] },
  {
    re: /pemula|beginner|baru mulai|first time/i,
    label: 'Beginner',
    terms: ['beginner', 'first', 'daily', 'easy'],
  },
  { re: /sensitif|sensitive/i, label: 'Sensitive skin', terms: ['sensitive'] },
  { re: /kering|\bdry\b/i, label: 'Dry skin', terms: ['dry'] },
  { re: /berminyak|\boily\b/i, label: 'Oily skin', terms: ['oily'] },
  { re: /\btrail\b|gunung|hiking/i, label: 'Trail', terms: ['trail'] },
  { re: /\brace\b|racing|balap|lomba/i, label: 'Race day', terms: ['race', 'racing'] },
]

const GIFT_FOR: [RegExp, string][] = [
  [/\b(ibu|mama|mum|mom|mother)\b/i, 'Mum'],
  [/\b(ayah|bapak|papa|dad|father)\b/i, 'Dad'],
  [/\b(pacar|partner|girlfriend|boyfriend)\b/i, 'a partner'],
  [/\b(istri|wife)\b/i, 'a wife'],
  [/\b(suami|husband)\b/i, 'a husband'],
  [/\b(teman|friend)\b/i, 'a friend'],
  [/\b(kakak|adik|sister|brother)\b/i, 'a sibling'],
]

// --- understanding ---

function productText(catalog: Catalog, p: Product): string {
  const values = catalog.attributes
    .filter((a) => p.attributes[a.id])
    .map((a) => `${a.name} ${formatAttribute(a, p.attributes[a.id])}`)
  return [p.name, ...p.tags, p.bestFor, p.description, ...values].join(' ').toLowerCase()
}

function categoryScore(catalog: Catalog, c: Category, terms: string[]): number {
  const name = c.name.toLowerCase()
  const desc = c.description.toLowerCase()
  const ids = categoryIdsUnder(catalog, c.id)
  const items = catalog.products.filter((p) => ids.has(p.categoryId))
  let score = 0
  for (const t of terms) {
    if (name.includes(t)) score += 3
    else if (desc.includes(t)) score += 1
    score += Math.min(
      2,
      items.filter((p) => `${p.name} ${p.tags.join(' ')}`.toLowerCase().includes(t)).length,
    )
  }
  return score
}

/** Reads budget, category, use case and gift intent from a sentence in Indonesian or English. */
export function understand(text: string, catalog: Catalog): Intent {
  const terms = translate(text)
  const useCases = USE_CASES.filter((u) => u.re.test(text)).map(({ label, terms }) => ({ label, terms }))
  const giftFor = GIFT_FOR.find(([re]) => re.test(text))?.[1] ?? null
  const gift = /hadiah|kado|bingkisan|\bgifts?\b/i.test(text) || (!!giftFor && /untuk|for/i.test(text))
  let categoryId: string | null = null
  let best = 1
  for (const c of catalog.categories) {
    const score = categoryScore(catalog, c, terms)
    // Ties go to the sub-category: "running shoes" is road running shoes, not every shoe.
    if (score > best || (score === best && score > 1 && !!c.parentId)) {
      best = score
      categoryId = c.id
    }
  }
  return { budgetMax: parseBudget(text), categoryId, useCases, gift, giftFor, terms }
}

/** A follow-up without a category refines the last request instead of starting over. */
export function mergeIntent(prev: Intent | null, next: Intent): Intent {
  if (!prev || next.categoryId) return next
  return {
    budgetMax: next.budgetMax ?? prev.budgetMax,
    categoryId: prev.categoryId,
    useCases: [
      ...prev.useCases,
      ...next.useCases.filter((u) => !prev.useCases.some((p) => p.label === u.label)),
    ],
    gift: next.gift || prev.gift,
    giftFor: next.giftFor ?? prev.giftFor,
    terms: [...new Set([...prev.terms, ...next.terms])],
  }
}

export const hasCriteria = (i: Intent) =>
  !!i.categoryId || i.useCases.length > 0 || i.gift || i.budgetMax !== null

/** "Category: Road running shoes", "Use case: 10K", "Budget ≤ Rp 1,5 jt". */
export function describeIntent(intent: Intent, catalog: Catalog): string[] {
  const out: string[] = []
  if (intent.categoryId) out.push(`Category: ${catalog.categoryMap.get(intent.categoryId)?.name ?? 'Any'}`)
  for (const u of intent.useCases) out.push(`Use case: ${u.label}`)
  if (intent.gift) out.push(intent.giftFor ? `Gift for ${intent.giftFor}` : 'Gift')
  if (intent.budgetMax !== null) out.push(`Budget ≤ ${fmtIdrShort(intent.budgetMax)}`)
  return out
}

// --- recommending ---

export interface Recommendation {
  picks: Product[]
  /** Set when nothing matched: the nearest category and its cheapest in-stock product. */
  closestCategory: Category | null
  cheapest: Product | null
}

/**
 * Ranks active, in-stock, non-assisted products inside the budget: category match first, then use-case,
 * gift and word matches against names, tags, best-for lines and attribute values, then popularity.
 * A signed-in customer's favourite category gets a small lift.
 */
export function recommend(
  intent: Intent,
  catalog: Catalog,
  favouriteCategoryId: string | null = null,
  limit = 4,
): Recommendation {
  const pool = catalog.products.filter((p) => isBuyable(catalog, p))
  const inCategory = intent.categoryId ? categoryIdsUnder(catalog, intent.categoryId) : null
  const favourite = favouriteCategoryId ? categoryIdsUnder(catalog, favouriteCategoryId) : null
  const scored = pool
    .filter(
      (p) =>
        (intent.budgetMax === null || fromPrice(p) <= intent.budgetMax) &&
        (!inCategory || inCategory.has(p.categoryId)),
    )
    .map((p) => {
      const text = productText(catalog, p)
      let score = 0
      for (const u of intent.useCases) if (u.terms.some((t) => text.includes(t))) score += 3
      for (const t of intent.terms) if (text.includes(t)) score += 1
      if (intent.gift && (giftable(catalog, p) || /\bset\b/.test(text))) score += 4
      if (favourite?.has(p.categoryId)) score += 2
      return { p, score }
    })
    // Without a category, only products that match something in the request count.
    .filter(({ score }) => inCategory || !hasWords(intent) || score > 0)
    .sort((a, b) => b.score - a.score || b.p.views30d - a.p.views30d)
  const picks = scored.slice(0, limit).map((s) => s.p)
  if (picks.length) return { picks, closestCategory: null, cheapest: null }
  const closestCategory =
    (intent.categoryId && catalog.categoryMap.get(intent.categoryId)) || popularCategories(catalog)[0] || null
  const near = closestCategory ? categoryIdsUnder(catalog, closestCategory.id) : null
  const cheapest =
    [...pool].filter((p) => !near || near.has(p.categoryId)).sort((a, b) => fromPrice(a) - fromPrice(b))[0] ??
    null
  return { picks, closestCategory, cheapest }
}

const hasWords = (i: Intent) => i.useCases.length > 0 || i.gift || i.terms.length > 0

// --- quick replies ---

export type ReplyAction =
  | { kind: 'text'; text: string }
  | { kind: 'cheaper' }
  | { kind: 'category'; categoryId: string }
  | { kind: 'budget'; max: number }
  | { kind: 'gift' }
  | { kind: 'reset' }

export interface QuickReply {
  label: string
  action: ReplyAction
}

/** Opening pills: the top categories and gift ideas. */
export function openingReplies(catalog: Catalog): QuickReply[] {
  return [
    ...popularCategories(catalog)
      .slice(0, 4)
      .map((c) => ({ label: c.name, action: { kind: 'category', categoryId: c.id } as ReplyAction })),
    { label: 'Gift ideas', action: { kind: 'gift' } },
  ]
}

/** Refining pills after an answer: cheaper, a sibling category, a lower budget, start over. */
export function followUps(intent: Intent, rec: Recommendation, catalog: Catalog): QuickReply[] {
  const out: QuickReply[] = []
  if (rec.picks.length > 1) out.push({ label: 'Cheaper', action: { kind: 'cheaper' } })
  const current = intent.categoryId ? catalog.categoryMap.get(intent.categoryId) : undefined
  const siblings = current?.parentId
    ? (catalog.childrenOf.get(current.parentId) ?? []).filter((c) => c.id !== current.id)
    : popularCategories(catalog).filter((c) => c.id !== current?.id)
  const sibling = siblings.find((c) =>
    catalog.products.some((p) => categoryIdsUnder(catalog, c.id).has(p.categoryId)),
  )
  if (sibling)
    out.push({
      label: `Show ${sibling.name.toLowerCase()} options`,
      action: { kind: 'category', categoryId: sibling.id },
    })
  const cap =
    intent.budgetMax === null || intent.budgetMax > 500_000
      ? 500_000
      : Math.max(50_000, Math.round(intent.budgetMax / 2 / 50_000) * 50_000)
  if (intent.budgetMax === null || cap < intent.budgetMax)
    out.push({ label: `Under ${fmtIdrShort(cap)}`, action: { kind: 'budget', max: cap } })
  out.push({ label: 'Something else', action: { kind: 'reset' } })
  return out
}

/** The intent after a quick reply; null starts the conversation over. */
export function applyReply(
  prev: Intent | null,
  action: ReplyAction,
  catalog: Catalog,
  lastPicks: readonly Product[],
): Intent | null {
  const base = prev ?? EMPTY_INTENT
  switch (action.kind) {
    case 'text':
      return mergeIntent(prev, understand(action.text, catalog))
    case 'cheaper': {
      const floor = lastPicks.length ? Math.min(...lastPicks.map(fromPrice)) : (base.budgetMax ?? 0)
      return floor > 0 ? { ...base, budgetMax: floor - 1 } : base
    }
    case 'category':
      return { ...EMPTY_INTENT, categoryId: action.categoryId, budgetMax: base.budgetMax }
    case 'budget':
      return { ...base, budgetMax: action.max }
    case 'gift':
      return { ...EMPTY_INTENT, gift: true, terms: ['gift'] }
    case 'reset':
      return null
  }
}
