import type { AttributeDef, ModifierGroup, Product } from '../../packages/types/src/index.ts'
import { createRng } from './rng.ts'

// Its own stream, so adding attributes never reshuffles orders and customers.
const rng = createRng(20261006)

type Def = Omit<AttributeDef, 'tenantId' | 'code'>
const A = (id: string, name: string, type: AttributeDef['type'], extra: Partial<Def> = {}): Def => ({
  id,
  name,
  type,
  unit: null,
  options: [],
  filterable: false,
  required: false,
  categoryIds: [],
  ...extra,
})

const DEFS: Record<string, Def[]> = {
  'ten-lari': [
    A('att-lari-drop', 'Heel-to-toe drop', 'number', {
      unit: 'mm',
      filterable: true,
      required: true,
      categoryIds: ['cat-lari-shoes'],
    }),
    A('att-lari-weight', 'Weight', 'number', {
      unit: 'g',
      filterable: true,
      categoryIds: ['cat-lari-shoes'],
    }),
    A('att-lari-cushion', 'Cushioning', 'select', {
      options: ['Low', 'Medium', 'Max'],
      filterable: true,
      required: true,
      categoryIds: ['cat-lari-shoes'],
    }),
    A('att-lari-surface', 'Surface', 'select', {
      options: ['Road', 'Track', 'Trail', 'Mixed'],
      filterable: true,
      categoryIds: ['cat-lari-shoes'],
    }),
    A('att-lari-plate', 'Carbon plate', 'boolean', { filterable: true, categoryIds: ['cat-lari-road'] }),
    A('att-lari-material', 'Material', 'text', { categoryIds: ['cat-lari-apparel', 'cat-lari-acc'] }),
    A('att-lari-fit', 'Fit', 'select', {
      options: ['Slim', 'Regular', 'Relaxed'],
      filterable: true,
      categoryIds: ['cat-lari-apparel'],
    }),
  ],
  'ten-aruna': [
    A('att-aruna-skin', 'Skin type', 'select', {
      options: ['All', 'Dry', 'Oily', 'Combination', 'Sensitive'],
      filterable: true,
      required: true,
      categoryIds: ['cat-aruna-face'],
    }),
    A('att-aruna-free', 'Fragrance-free', 'boolean', { filterable: true, categoryIds: ['cat-aruna-skin'] }),
    A('att-aruna-key', 'Key ingredient', 'text', { categoryIds: ['cat-aruna-skin', 'cat-aruna-hair'] }),
    A('att-aruna-use', 'How to use', 'text', { categoryIds: ['cat-aruna-skin', 'cat-aruna-hair'] }),
    A('att-aruna-bpom', 'BPOM number', 'text', { required: true }),
  ],
  'ten-teknika': [
    A('att-tek-power', 'Motor power', 'number', {
      unit: 'kW',
      filterable: true,
      required: true,
      categoryIds: ['cat-tek-machines'],
    }),
    A('att-tek-voltage', 'Supply', 'select', {
      options: ['220 V, 1 phase', '380 V, 3 phase'],
      filterable: true,
      categoryIds: ['cat-tek-machines'],
    }),
    A('att-tek-spindle', 'Spindle speed', 'number', { unit: 'rpm', categoryIds: ['cat-tek-cnc'] }),
    A('att-tek-warranty', 'Warranty', 'number', {
      unit: 'months',
      categoryIds: ['cat-tek-machines', 'cat-tek-parts'],
    }),
  ],
}

const code = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

export const attributes: AttributeDef[] = Object.entries(DEFS).flatMap(([tenantId, list]) =>
  list.map((d) => ({ ...d, tenantId, code: code(d.name) })),
)

/** Beauty facts per Aruna product, so routines, concerns and ingredient pages line up with the names. */
const ARUNA: Record<string, { skin: string; free: 'yes' | 'no'; key?: string; use?: string }> = {
  'AR-101': {
    skin: 'Sensitive',
    free: 'yes',
    key: 'Ceramide',
    use: 'Press 3 drops into damp skin, morning and night.',
  },
  'AR-102': {
    skin: 'All',
    free: 'yes',
    key: 'Vitamin C',
    use: 'Pat 2 to 3 drops after toner in the morning, then SPF.',
  },
  'AR-103': {
    skin: 'All',
    free: 'yes',
    key: 'Centella',
    use: 'Massage onto wet skin for 30 seconds, rinse.',
  },
  'AR-104': {
    skin: 'All',
    free: 'yes',
    key: 'Niacinamide',
    use: 'Two finger lengths as the last morning step; reapply every 2 hours outdoors.',
  },
  'AR-105': {
    skin: 'Dry',
    free: 'no',
    key: 'Retinal',
    use: 'A pea-sized amount at night, three nights a week to start.',
  },
  'AR-106': {
    skin: 'Dry',
    free: 'yes',
    key: 'Hyaluronic acid',
    use: 'Pour into palms and press in after cleansing.',
  },
  'AR-107': {
    skin: 'Oily',
    free: 'yes',
    key: 'Kaolin clay',
    use: 'Thin layer for 10 minutes, twice a week.',
  },
  'AR-113': {
    skin: 'Oily',
    free: 'no',
    key: 'Salicylic acid',
    use: 'Massage into the scalp, leave 2 minutes, rinse.',
  },
  'AR-114': { skin: 'All', free: 'no', key: 'Argan oil', use: 'Two drops through damp ends.' },
  'AR-121': { skin: 'All', free: 'yes', key: 'Peptides', use: 'Tap a rice grain around the eyes, night.' },
}

/** Plausible values for the seeded products, by attribute. */
function valueFor(def: AttributeDef, p: Product): string | null {
  const has = (tag: string) => p.tags.includes(tag)
  switch (def.id) {
    case 'att-lari-drop':
      return String(has('stability') ? 10 : has('race') ? 8 : rng.pick([4, 6, 8, 10]))
    case 'att-lari-weight':
      return String(has('race') ? rng.int(190, 215) : rng.int(240, 320))
    case 'att-lari-cushion':
      return has('max cushion') ? 'Max' : has('race') || has('tempo') ? 'Medium' : rng.pick(['Medium', 'Max'])
    case 'att-lari-surface':
      return p.categoryId === 'cat-lari-trail' ? 'Trail' : has('race') ? 'Road' : rng.pick(['Road', 'Mixed'])
    case 'att-lari-plate':
      return has('carbon plate') ? 'yes' : 'no'
    case 'att-lari-material':
      return rng.pick(['Recycled polyester', 'Nylon and elastane', 'Merino blend'])
    case 'att-lari-fit':
      return rng.pick(['Slim', 'Regular', 'Regular', 'Relaxed'])
    case 'att-aruna-skin':
      return ARUNA[p.code]?.skin ?? 'All'
    case 'att-aruna-free':
      return ARUNA[p.code]?.free ?? 'no'
    case 'att-aruna-key':
      return ARUNA[p.code]?.key ?? null
    case 'att-aruna-use':
      return ARUNA[p.code]?.use ?? null
    case 'att-aruna-bpom':
      return `NA${rng.int(18000000000, 18999999999)}`
    case 'att-tek-power':
      return String(p.categoryId === 'cat-tek-cnc' ? rng.pick([11, 15, 18.5]) : rng.pick([22, 37]))
    case 'att-tek-voltage':
      return '380 V, 3 phase'
    case 'att-tek-spindle': {
      // Keep the rng draw so later values stay put; a speed stated in the description wins.
      const picked = rng.pick([4500, 8000, 10000, 12000])
      const stated = /([\d,]+) rpm/.exec(p.description)?.[1]?.replace(/,/g, '')
      return stated ?? String(picked)
    }
    case 'att-tek-warranty':
      return String(p.categoryId === 'cat-tek-parts' ? 6 : 24)
    default:
      return null
  }
}

/** Fills product attribute values; leaves a few required ones empty so the gap shows in the console. */
export function fillAttributes(products: Product[], parentOf: (categoryId: string) => string | null) {
  for (const p of products) {
    if (p.type === 'service' || p.type === 'digital' || p.type === 'subscription') continue
    const parent = parentOf(p.categoryId)
    for (const def of attributes) {
      if (def.tenantId !== p.tenantId) continue
      const applies =
        !def.categoryIds.length ||
        def.categoryIds.includes(p.categoryId) ||
        (!!parent && def.categoryIds.includes(parent))
      if (!applies || (p.status === 'draft' && rng.chance(0.6))) continue
      const value = valueFor(def, p)
      if (value !== null) p.attributes[def.id] = value
    }
  }
}

type Opt = [string, number]
const group = (
  id: string,
  tenantId: string,
  name: string,
  selection: ModifierGroup['selection'],
  required: boolean,
  maxChoices: number,
  options: Opt[],
  productIds: string[],
  stockTracked = false,
): ModifierGroup => ({
  id,
  tenantId,
  name,
  selection,
  required,
  maxChoices,
  options: options.map(([optName, priceDelta], i) => ({
    id: `${id}-o${i + 1}`,
    name: optName,
    priceDelta,
    stockTracked,
  })),
  productIds,
})

export const modifiers: ModifierGroup[] = [
  group(
    'mod-lari-laces',
    'ten-lari',
    'Spare laces',
    'single',
    false,
    1,
    [
      ['Black', 15_000],
      ['Neon yellow', 15_000],
      ['Reflective', 25_000],
    ],
    ['prd-lr-101', 'prd-lr-102', 'prd-lr-103', 'prd-lr-104', 'prd-lr-105', 'prd-lr-106'],
    true,
  ),
  group(
    'mod-lari-gift',
    'ten-lari',
    'Gift wrap',
    'single',
    false,
    1,
    [
      ['Gift box and card', 25_000],
      ['Eco wrap', 10_000],
    ],
    ['prd-lr-101', 'prd-lr-102', 'prd-lr-110', 'prd-lr-119', 'prd-lr-126'],
    true,
  ),
  group(
    'mod-lari-print',
    'ten-lari',
    'Name print',
    'multiple',
    false,
    2,
    [
      ['Name on the back', 35_000],
      ['Club logo on the chest', 45_000],
    ],
    ['prd-lr-110', 'prd-lr-114'],
  ),
  group(
    'mod-lari-gel',
    'ten-lari',
    'Gel flavours',
    'multiple',
    true,
    3,
    [
      ['Citrus', 0],
      ['Berry', 0],
      ['Coffee, caffeinated', 0],
      ['Salted caramel', 0],
    ],
    ['prd-lr-120'],
    true,
  ),
  group(
    'mod-aruna-box',
    'ten-aruna',
    'Gift box',
    'single',
    false,
    1,
    [
      ['Signature gift box', 30_000],
      ['Box with handwritten card', 45_000],
    ],
    ['prd-ar-115', 'prd-ar-116', 'prd-ar-117', 'prd-ar-118'],
    true,
  ),
  group(
    'mod-aruna-sample',
    'ten-aruna',
    'Free samples',
    'multiple',
    false,
    2,
    [
      ['Calm Barrier Serum 5 ml', 0],
      ['Bright C Essence 5 ml', 0],
      ['Daily Sunscreen 10 ml', 0],
    ],
    ['prd-ar-101', 'prd-ar-102', 'prd-ar-104', 'prd-ar-105', 'prd-ar-117'],
    true,
  ),
  group(
    'mod-tek-install',
    'ten-teknika',
    'Installation',
    'single',
    true,
    1,
    [
      ['Self installation', 0],
      ['On-site installation', 12_500_000],
    ],
    ['prd-tk-104', 'prd-tk-105'],
  ),
  group(
    'mod-tek-warranty',
    'ten-teknika',
    'Extended warranty',
    'single',
    false,
    1,
    [
      ['12 extra months', 9_500_000],
      ['24 extra months', 17_000_000],
    ],
    ['prd-tk-104', 'prd-tk-105'],
  ),
]
