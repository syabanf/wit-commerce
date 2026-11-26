// Multi-tenant end-to-end run against a live API: five brands sign up at once, stock their stores,
// take guest and registered orders, process them, and then try to read and write each other's data.
// Usage: pnpm exec tsx scripts/e2e/multi-tenant.ts [api origin]   (default http://localhost:8811)
// The API must run with TRUST_PROXY=true, so each brand and shopper can sign up from its own address,
// and with SEED_DIR pointing at packages/fixtures/data when it starts outside the repo.
// The script reads arbitrary API answers, so its JSON values are untyped on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { termsVersion } from '../../packages/fixtures/src/legal.ts'

const ORIGIN = process.argv[2] ?? process.env.API_ORIGIN ?? 'http://localhost:8811'
const BASE = `${ORIGIN}/api/v1`
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'e2e-demo-pass'
const RUN = Date.now().toString(36).slice(-6)
const PASSWORD = `E2e-${RUN}-pass!42`

// --- recording ---

interface Sample {
  step: string
  ms: number
  status: number
}
const samples: Sample[] = []
interface Check {
  area: string
  name: string
  ok: boolean
  detail: string
}
const checks: Check[] = []
const notes: string[] = []

function check(area: string, name: string, ok: boolean, detail = '') {
  checks.push({ area, name, ok, detail })
  if (!ok) console.log(`  FAIL [${area}] ${name} ${detail}`)
}

let ipSeq = 0
const nextIp = () => {
  ipSeq++
  return `10.${(Number.parseInt(RUN, 36) >> 8) & 255}.${(ipSeq >> 8) & 255}.${ipSeq & 255}`
}

interface Res {
  status: number
  body: any
  text: string
  headers: Headers
  ms: number
}

async function api(
  step: string,
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; ip?: string; form?: FormData } = {},
): Promise<Res> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  if (opts.ip) headers['X-Forwarded-For'] = opts.ip
  let body: BodyInit | undefined
  if (opts.form) body = opts.form
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  const started = performance.now()
  let res: Response
  try {
    res = await fetch(BASE + path, { method, headers, body })
  } catch (err) {
    const ms = performance.now() - started
    samples.push({ step, ms, status: 0 })
    return { status: 0, body: null, text: String(err), headers: new Headers(), ms }
  }
  const type = res.headers.get('content-type') ?? ''
  let text: string
  let parsed: any = null
  if (type.includes('application/pdf')) {
    const buf = await res.arrayBuffer()
    text = `<pdf ${buf.byteLength} bytes>`
  } else {
    text = await res.text()
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = null
    }
  }
  const ms = performance.now() - started
  samples.push({ step, ms, status: res.status })
  return { status: res.status, body: parsed, text, headers: res.headers, ms }
}

const excerpt = (r: Res) => `${r.status} ${r.text.slice(0, 220).replace(/\s+/g, ' ')}`
const expectStatus = (area: string, name: string, r: Res, ok: number[]) =>
  check(area, name, ok.includes(r.status), `${name}: got ${excerpt(r)}`)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const id = (prefix: string) => `${prefix}-e2e${RUN}${Math.random().toString(36).slice(2, 9)}`
const nowIso = () => new Date().toISOString()

// --- event streams ---

interface Stream {
  label: string
  frames: string[]
  status: number
  close: () => void
  opened: Promise<void>
}

function openStream(label: string, path: string, token?: string): Stream {
  const ctrl = new AbortController()
  const frames: string[] = []
  let resolveOpen: () => void = () => {}
  const opened = new Promise<void>((r) => (resolveOpen = r))
  const stream: Stream = { label, frames, status: 0, close: () => ctrl.abort(), opened }
  const url = `${BASE}${path}${token ? `?token=${encodeURIComponent(token)}` : ''}`
  ;(async () => {
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'text/event-stream' } })
      stream.status = res.status
      if (!res.ok || !res.body) {
        resolveOpen()
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          if (frame.startsWith('event: hello')) resolveOpen()
          if (frame.startsWith('event: delta')) frames.push(frame.slice(frame.indexOf('data: ') + 6))
        }
      }
    } catch {
      // aborted
    }
    resolveOpen()
  })()
  return stream
}

// --- brand setup ---

const INDUSTRIES = ['sport', 'beauty', 'fnb', 'fashion', 'electronics'] as const
const TEMPLATES = ['tpl-minimal', 'tpl-editorial', 'tpl-catalog']
const WORDS = ['Zorblax', 'Quindle', 'Vortaro', 'Plimsk', 'Draxum']

interface Brand {
  i: number
  name: string
  subdomain: string
  email: string
  industry: string
  token: string
  userId: string
  tenantId: string
  code: string
  word: string
  pageId: string
  warehouseId: string
  products: any[]
  categoryId: string
  voucher: string
  state?: any
  shop?: any
  terms?: string
  orders: Placed[]
  mediaId?: string
}

interface Placed {
  orderId: string
  code: string
  method: 'cod' | 'bank_transfer'
  total: number
  shopperToken: string
  customerId: string
  lines: { productId: string; variantId: string; qty: number; price: number }[]
  registered: boolean
  lineUnit?: number
}

async function signUp(i: number): Promise<Brand | null> {
  // Every name shares its first ten letters, so the tenant codes are picked under contention.
  const name = `Kopi${RUN} ${['Lari', 'Glow', 'Rasa', 'Gaya', 'Volt'][i]}`
  const subdomain = `e2e${RUN}b${i}`
  const email = `owner${i}.${RUN}@example.com`
  const r = await api('signup', 'POST', '/auth/signup', {
    ip: nextIp(),
    body: {
      storeName: name,
      subdomain,
      industry: INDUSTRIES[i],
      templateId: TEMPLATES[i % TEMPLATES.length],
      ownerName: `Owner ${i}`,
      email,
      password: PASSWORD,
      website: '',
    },
  })
  expectStatus('signup', `brand ${i} signs up`, r, [200])
  if (r.status !== 200) return null
  return {
    i,
    name,
    subdomain,
    email,
    industry: INDUSTRIES[i]!,
    token: r.body.token,
    userId: r.body.user.id,
    tenantId: r.body.user.tenantIds[0],
    code: '',
    word: WORDS[i]!,
    pageId: '',
    warehouseId: '',
    products: [],
    categoryId: '',
    voucher: `E2E${RUN}V${i}`.toUpperCase(),
    orders: [],
  }
}

async function loadState(b: Brand) {
  const r = await api('GET /state', 'GET', '/state', { token: b.token })
  if (r.status === 200) b.state = r.body.state
  return r
}

function product(b: Brand, n: number, variants = 2) {
  const pid = id('prd')
  const sizes = ['S', 'M', 'L'].slice(0, variants)
  const base = 85_000 + n * 20_000 + b.i * 1_000
  return {
    id: pid,
    tenantId: b.tenantId,
    code: `P${RUN}${b.i}${String(n).padStart(3, '0')}`.toUpperCase(),
    name: `${b.word} ${b.industry} item ${n}`,
    categoryId: b.categoryId,
    type: 'physical',
    status: 'draft',
    price: base,
    compareAt: null,
    memberPrice: null,
    cost: Math.round(base * 0.5),
    tags: ['e2e'],
    options: [{ name: 'Size', values: sizes }],
    attributes: {},
    description: `A ${b.word} test product for the multi-tenant run.`,
    bestFor: 'testing',
    variants: sizes.map((s, k) => ({
      id: `${pid}-v${k}`,
      sku: `SKU-${RUN}-${b.i}-${n}-${s}`,
      name: s,
      optionValues: { Size: s },
      price: base + k * 5_000,
      barcode: '',
    })),
    rating: 0,
    reviewCount: 0,
    views30d: 0,
    assisted: false,
    createdAt: nowIso(),
    publishAt: null,
  }
}

async function setUpBrand(b: Brand) {
  const area = 'setup'
  const me = await api('GET /auth/me', 'GET', '/auth/me', { token: b.token })
  check(
    area,
    `brand ${b.i} /auth/me is the owner`,
    me.status === 200 && me.body?.user?.id === b.userId,
    excerpt(me),
  )
  check(
    area,
    `brand ${b.i} /auth/me lists only its brand`,
    JSON.stringify(me.body?.user?.tenantIds) === JSON.stringify([b.tenantId]),
    excerpt(me),
  )
  await loadState(b)
  const s = b.state
  check(
    area,
    `brand ${b.i} /state has one tenant`,
    s?.tenants?.length === 1 && s.tenants[0].id === b.tenantId,
    `tenants=${s?.tenants?.map((t: any) => t.id)}`,
  )
  for (const c of [
    'products',
    'orders',
    'customers',
    'stock',
    'warehouses',
    'paymentTypes',
    'pages',
    'promotions',
  ]) {
    const foreign = (s?.[c] ?? []).filter((row: any) => row.tenantId && row.tenantId !== b.tenantId)
    check(
      area,
      `brand ${b.i} /state.${c} holds only its rows`,
      foreign.length === 0,
      `${foreign.length} foreign rows`,
    )
  }
  const foreignUsers = (s?.users ?? []).filter(
    (u: any) => u.role !== 'platform_admin' && !(u.tenantIds ?? []).includes(b.tenantId),
  )
  check(
    area,
    `brand ${b.i} /state.users holds only its people`,
    foreignUsers.length === 0,
    `${foreignUsers.length}`,
  )
  const adminEmails = (s?.users ?? []).filter((u: any) => u.role === 'platform_admin' && u.email)
  check(
    area,
    `brand ${b.i} /state hides platform admin emails`,
    adminEmails.length === 0,
    `${adminEmails.length}`,
  )
  const foreignTemplates = (s?.templates ?? []).filter((t: any) => t.tenantId && t.tenantId !== b.tenantId)
  check(
    area,
    `brand ${b.i} /state.templates are global or its own`,
    foreignTemplates.length === 0,
    foreignTemplates.map((t: any) => t.id).join(','),
  )
  b.code = s.tenants[0].code
  b.pageId = s.pages.find((p: any) => p.kind === 'home')?.id
  b.warehouseId = s.warehouses[0]?.id

  // Legal details and shop settings.
  const legal = await api('PUT /tenants/{id}/legal', 'PUT', `/tenants/${b.tenantId}/legal`, {
    token: b.token,
    body: {
      entityName: `CV ${b.name}`,
      businessType: 'cv',
      nib: `91200${RUN.length}${String(b.i).padStart(7, '0')}`.slice(0, 13).padEnd(13, '1'),
      npwp: `01234567890123${b.i}`.padEnd(16, '0').slice(0, 16),
      address: `Jl. Testing No. ${b.i + 1}`,
      city: 'Jakarta',
      phone: `+62 811 000 00${b.i}`,
      email: `cs${b.i}.${RUN}@example.com`,
      hours: 'Monday to Friday, 09:00 to 17:00 WIB',
      complaintDays: 3,
      disputeForum: 'bpsk',
    },
  })
  expectStatus(area, `brand ${b.i} saves legal details`, legal, [200])
  const settings = await api(
    'PUT /tenants/{id}/shop-settings',
    'PUT',
    `/tenants/${b.tenantId}/shop-settings`,
    {
      token: b.token,
      body: { returnWindowDays: 7, shopperEmailsOff: [] },
    },
  )
  expectStatus(area, `brand ${b.i} saves shop settings`, settings, [200])

  // Category, then products the way the console saves them: draft first, then active.
  b.categoryId = id('cat')
  const cat = await api('PUT /categories/{id}', 'PUT', `/categories/${b.categoryId}`, {
    token: b.token,
    body: {
      id: b.categoryId,
      tenantId: b.tenantId,
      name: `${b.word} things`,
      description: '',
      parentId: null,
    },
  })
  expectStatus(area, `brand ${b.i} creates a category`, cat, [200])
  const count = 3 + (b.i % 3)
  for (let n = 1; n <= count; n++) {
    const p = product(b, n, n === 1 ? 3 : 2)
    const saved = await api('PUT /products/{id}', 'PUT', `/products/${p.id}`, { token: b.token, body: p })
    expectStatus(area, `brand ${b.i} saves product ${n}`, saved, [200])
    const active = await api('POST /products/{id}/status', 'POST', `/products/${p.id}/status`, {
      token: b.token,
      body: { status: 'active' },
    })
    expectStatus(area, `brand ${b.i} activates product ${n}`, active, [200])
    p.status = 'active'
    b.products.push(p)
  }
  // Stock: receive every variant, then correct one level by hand.
  for (const p of b.products) {
    for (const v of p.variants) {
      const rec = await api('POST /stock/receive', 'POST', '/stock/receive', {
        token: b.token,
        body: {
          tenantId: b.tenantId,
          productId: p.id,
          variantId: v.id,
          warehouseId: b.warehouseId,
          qty: 60,
          note: 'e2e receipt',
        },
      })
      expectStatus(area, `brand ${b.i} receives ${v.sku}`, rec, [200])
    }
  }
  await loadState(b)
  const level = b.state.stock.find((l: any) => l.variantId === b.products[0].variants[0].id)
  const adj = await api('POST /stock/{id}/adjust', 'POST', `/stock/${level?.id}/adjust`, {
    token: b.token,
    body: { delta: -2, note: 'e2e count correction' },
  })
  expectStatus(area, `brand ${b.i} adjusts a stock level`, adj, [200])

  // A third payment type, as the console's Payments screen saves one.
  const payId = id('pay')
  const pay = await api('PUT /payment-types/{id}', 'PUT', `/payment-types/${payId}`, {
    token: b.token,
    body: {
      id: payId,
      tenantId: b.tenantId,
      name: 'Transfer BCA',
      method: 'bank_transfer',
      provider: 'Manual',
      enabled: true,
      feePercent: 0,
      feeFixed: 0,
      minAmount: 0,
      maxAmount: null,
      instructions: 'BCA 123 456 7890 a.n. e2e',
      sort: 2,
    },
  })
  expectStatus(area, `brand ${b.i} adds a payment type`, pay, [200])

  // A code promotion; other stores must not open it.
  const promoId = id('promo')
  const promo = await api('PUT /promotions/{id}', 'PUT', `/promotions/${promoId}`, {
    token: b.token,
    body: {
      id: promoId,
      tenantId: b.tenantId,
      code: b.voucher,
      name: `${b.word} 10%`,
      kind: 'percentage',
      trigger: 'code',
      value: 10,
      maxDiscount: 50_000,
      buyQty: null,
      getQty: null,
      getDiscountPct: null,
      minSpend: 0,
      segmentId: null,
      categoryIds: [],
      productIds: [],
      paymentTypeIds: [],
      status: 'active',
      startAt: '2025-01-01T00:00:00+07:00',
      endAt: '2027-12-31T00:00:00+07:00',
      usageLimit: null,
      used: 0,
      revenue: 0,
      sellerId: null,
    },
  })
  expectStatus(area, `brand ${b.i} creates a code promotion`, promo, [200])

  // Home page: write the hero, publish, change it as a draft, check shoppers still see the old one, publish again.
  const page = b.state.pages.find((p: any) => p.id === b.pageId)
  const sections = page.sections.map((s: any) =>
    s.kind === 'hero'
      ? { ...s, headline: `${b.word} live`, body: 'Welcome' }
      : s.kind === 'featured_product'
        ? { ...s, productIds: b.products.slice(0, 2).map((p) => p.id) }
        : s,
  )
  const save1 = await api('PUT /pages/{id}', 'PUT', `/pages/${b.pageId}`, {
    token: b.token,
    body: { sections, seo: page.seo, note: 'first copy' },
  })
  expectStatus(area, `brand ${b.i} saves the home page`, save1, [200])
  const pub = await api('POST /pages/{id}/publish', 'POST', `/pages/${b.pageId}/publish`, { token: b.token })
  expectStatus(area, `brand ${b.i} publishes the store`, pub, [200])
  const draftSections = sections.map((s: any) =>
    s.kind === 'hero' ? { ...s, headline: `${b.word} draft` } : s,
  )
  const save2 = await api('PUT /pages/{id}', 'PUT', `/pages/${b.pageId}`, {
    token: b.token,
    body: { sections: draftSections, seo: page.seo, note: 'draft copy' },
  })
  expectStatus(area, `brand ${b.i} saves a draft over the live page`, save2, [200])
  const shop1 = await api('GET /shop/{s}/state', 'GET', `/shop/${b.subdomain}/state`)
  expectStatus(area, `brand ${b.i} store answers after publish`, shop1, [200])
  const hero1 = shop1.body?.state?.pages
    ?.find((p: any) => p.kind === 'home')
    ?.sections?.find((s: any) => s.kind === 'hero')
  check(
    area,
    `brand ${b.i} shoppers do not see the unpublished draft`,
    hero1?.headline === `${b.word} live`,
    `hero=${hero1?.headline}`,
  )
  check(area, `brand ${b.i} store state carries no pageDrafts`, !shop1.body?.state?.pageDrafts?.length, '')
  const pub2 = await api('POST /pages/{id}/publish', 'POST', `/pages/${b.pageId}/publish`, { token: b.token })
  expectStatus(area, `brand ${b.i} publishes the draft`, pub2, [200])
  const shop2 = await api('GET /shop/{s}/state', 'GET', `/shop/${b.subdomain}/state`)
  const hero2 = shop2.body?.state?.pages
    ?.find((p: any) => p.kind === 'home')
    ?.sections?.find((s: any) => s.kind === 'hero')
  check(
    area,
    `brand ${b.i} shoppers see the published draft`,
    hero2?.headline === `${b.word} draft`,
    `hero=${hero2?.headline}`,
  )
  const shopProducts = shop2.body?.state?.products ?? []
  check(
    area,
    `brand ${b.i} store lists its ${b.products.length} products`,
    shopProducts.length === b.products.length,
    `got ${shopProducts.length}`,
  )
  check(
    area,
    `brand ${b.i} store hides product cost`,
    shopProducts.every((p: any) => p.cost === undefined || p.cost === 0),
    `cost=${shopProducts.map((p: any) => p.cost)}`,
  )

  // An image in the brand's media library, for the isolation checks.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  )
  const form = new FormData()
  form.append('file', new Blob([png], { type: 'image/png' }), `e2e-${b.i}.png`)
  const up = await api('POST /media', 'POST', `/media?tenantId=${b.tenantId}`, { token: b.token, form })
  expectStatus(area, `brand ${b.i} uploads an image`, up, [200, 201])
  b.mediaId = up.body?.id ?? up.body?.media?.id
}

// What a free (Starter) brand may and may not do.
async function planLimits(b: Brand) {
  const area = 'plan'
  const wh = await api('POST /warehouses', 'POST', '/warehouses', {
    token: b.token,
    body: { tenantId: b.tenantId, code: 'WH2', name: 'Second', city: 'Bandung' },
  })
  check(
    area,
    'starter brand cannot add a second warehouse (409 PLAN_LIMIT)',
    wh.status === 409 && wh.body?.code === 'PLAN_LIMIT',
    excerpt(wh),
  )
  // Fill the catalog to the Starter cap of 50 products; the 51st is refused.
  let n = b.products.length + 1
  let lastOk = 0
  let refused: Res | null = null
  for (; n <= 52; n++) {
    const p = product(b, 100 + n, 1)
    const r = await api('PUT /products/{id} (fill)', 'PUT', `/products/${p.id}`, { token: b.token, body: p })
    if (r.status === 200) lastOk = n
    else {
      refused = r
      break
    }
  }
  check(area, 'starter brand saves up to 50 products', lastOk === 50, `last saved #${lastOk}`)
  check(
    area,
    'the 51st product answers 409 PLAN_LIMIT',
    refused?.status === 409 && refused.body?.code === 'PLAN_LIMIT',
    refused ? excerpt(refused) : 'never refused',
  )
  // Editing an existing product still works at the cap.
  const edit = await api('PUT /products/{id}', 'PUT', `/products/${b.products[0].id}`, {
    token: b.token,
    body: { ...b.products[0], description: 'edited at the cap' },
  })
  expectStatus(area, 'starter brand still edits a product at the cap', edit, [200])
  const plan = await api('GET /tenants/{id}/plan', 'GET', `/tenants/${b.tenantId}/plan`, { token: b.token })
  expectStatus(area, 'starter brand reads its plan overview', plan, [200])
  if (plan.status === 200) notes.push(`Plan overview of a new brand: ${plan.text.slice(0, 400)}`)
  // Staff seats: Starter allows 3 including the owner.
  const staff: Res[] = []
  for (let k = 0; k < 3; k++) {
    staff.push(
      await api('POST /users', 'POST', '/users', {
        token: b.token,
        body: {
          name: `Staff ${k}`,
          email: `staff${k}.${b.i}.${RUN}@example.com`,
          title: 'Ops',
          role: 'operations',
          tenantIds: [b.tenantId],
        },
      }),
    )
  }
  notes.push(
    `Staff creation on a Starter brand: ${staff.map((r) => `${r.status}${r.body?.code ? ' ' + r.body.code : ''}`).join(', ')}`,
  )
  check(
    area,
    'starter brand adds 2 staff, the 3rd answers PLAN_LIMIT',
    staff[0]!.status === 200 &&
      staff[1]!.status === 200 &&
      staff[2]!.status === 409 &&
      staff[2]!.body?.code === 'PLAN_LIMIT',
    staff.map(excerpt).join(' | '),
  )
  // Display currencies cap at 2.
  const cur = await api(
    'PUT /tenants/{id}/display-currencies',
    'PUT',
    `/tenants/${b.tenantId}/display-currencies`,
    {
      token: b.token,
      body: { currencies: ['USD', 'SGD', 'MYR'] },
    },
  )
  check(
    area,
    'starter brand cannot show 3 display currencies',
    cur.status === 409 && cur.body?.code === 'PLAN_LIMIT',
    excerpt(cur),
  )
}

// --- shoppers ---

const COURIER = { id: 'sicepat', fee: 15_000 }

async function shopState(b: Brand) {
  const r = await api('GET /shop/{s}/state', 'GET', `/shop/${b.subdomain}/state`)
  b.shop = r.body?.state
  b.terms = termsVersion(b.shop.tenants[0], b.shop.paymentTypes)
  return r
}

interface CartLine {
  productId: string
  categoryId: string
  variantId: string
  qty: number
  price: number
}

function pickLines(b: Brand, seed: number): CartLine[] {
  const active = b.shop.products.filter((p: any) => p.status === 'active' && p.variants?.length)
  const a = active[seed % active.length]
  const c = active[(seed + 1) % active.length]
  const lines: CartLine[] = []
  for (const [p, qty] of [
    [a, 1],
    [c, seed % 2 ? 2 : 1],
  ] as const) {
    const v = p.variants[seed % p.variants.length]
    if (lines.some((l) => l.variantId === v.id)) continue
    lines.push({ productId: p.id, categoryId: p.categoryId, variantId: v.id, qty, price: v.price })
  }
  return lines
}

async function priceCart(b: Brand, lines: CartLine[], paymentTypeId: string) {
  const r = await api('POST /shop/{s}/price', 'POST', `/shop/${b.subdomain}/price`, {
    body: {
      lines: lines.map((l) => ({
        productId: l.productId,
        categoryId: l.categoryId,
        qty: l.qty,
        unitPrice: l.price,
      })),
      paymentTypeId,
    },
  })
  return r
}

function buildOrder(
  b: Brand,
  lines: CartLine[],
  payment: any,
  quote: any,
  customer: any | null,
  customerId: string,
) {
  const tenant = b.shop.tenants[0]
  const freeMin = tenant.loyalty?.freeShippingMin ?? 0
  const shipping = quote.freeShipping || quote.subtotal >= freeMin ? 0 : COURIER.fee
  const total = Math.max(0, quote.subtotal - quote.discount + shipping)
  const at = nowIso()
  return {
    order: {
      id: id('ord'),
      tenantId: tenant.id,
      code: `${tenant.code}-00001`,
      customerId,
      channel: 'web',
      sellerId: null,
      campaignId: null,
      status: 'confirmed',
      paymentStatus: 'pending',
      paymentMethod: payment.method,
      paymentTypeId: payment.id,
      courier: COURIER.id,
      trackingNo: null,
      warehouseId: b.shop.warehouses[0].id,
      city: 'Jakarta',
      lines: lines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        qty: l.qty,
        price: l.price,
      })),
      subtotal: quote.subtotal,
      discount: quote.discount,
      shipping,
      total,
      voucherCode: null,
      discountLines: quote.discounts ?? [],
      pointsEarned: Math.floor(total / 10_000) * (tenant.loyalty?.pointsPer10k ?? 1),
      createdAt: at,
      cancelReason: null,
      refundedAmount: 0,
      events: [
        { id: id('oev'), at, by: 'storefront', status: 'new', note: 'Order placed on the storefront' },
      ],
      termsVersion: b.terms,
      termsAcceptedAt: at,
    },
    customer,
  }
}

function guestCustomer(b: Brand, k: number) {
  const tenant = b.shop.tenants[0]
  return {
    id: id('cus'),
    tenantId: tenant.id,
    code: `${tenant.code}-C00001`,
    name: `Guest ${b.i}-${k}`,
    email: `guest${k}.${b.i}.${RUN}@example.com`,
    phone: '+62 811 2222 3333',
    city: 'Jakarta',
    source: 'web',
    stage: 'first_buyer',
    tier: 'member',
    points: 0,
    tags: [],
    interests: [],
    sellerId: null,
    createdAt: nowIso(),
    birthday: null,
    color: '#6a5a8c',
  }
}

async function guestCheckout(b: Brand, k: number, method: 'cod' | 'bank_transfer'): Promise<Placed | null> {
  const payment = b.shop.paymentTypes.find((p: any) => p.method === method && p.enabled)
  const lines = pickLines(b, k)
  const quote = await priceCart(b, lines, payment.id)
  if (quote.status !== 200) {
    check('checkout', `brand ${b.i} guest ${k} prices the cart`, false, excerpt(quote))
    return null
  }
  const customer = guestCustomer(b, k)
  const body = buildOrder(b, lines, payment, quote.body, customer, customer.id)
  const r = await api('POST /shop/{s}/orders (guest)', 'POST', `/shop/${b.subdomain}/orders`, {
    body,
    ip: nextIp(),
  })
  expectStatus('checkout', `brand ${b.i} guest ${k} (${method}) places an order`, r, [200])
  if (r.status !== 200) return null
  const saved = r.body?.upserts?.orders?.find((o: any) => o.id === body.order.id)
  check('checkout', `brand ${b.i} guest ${k} gets a shopper token`, typeof r.body?.token === 'string', '')
  const foreignRows = Object.values(r.body?.upserts ?? {})
    .flat()
    .filter((row: any) => row?.tenantId && row.tenantId !== b.tenantId)
  check(
    'isolation',
    `brand ${b.i} guest ${k} order receipt holds only its store's rows`,
    foreignRows.length === 0,
    `${foreignRows.length}`,
  )
  if (k === 0 && b.i === 0)
    notes.push(`A guest's order receipt carries upserts of: ${Object.keys(r.body?.upserts ?? {}).join(', ')}`)
  return {
    orderId: body.order.id,
    code: saved?.code ?? '?',
    method,
    total: saved?.total ?? body.order.total,
    shopperToken: r.body?.token,
    customerId: customer.id,
    lines: body.order.lines,
    registered: false,
  }
}

async function registeredShopper(b: Brand): Promise<{ token: string; customerId: string; placed: Placed[] }> {
  const area = 'checkout'
  const email = `member.${b.i}.${RUN}@example.com`
  const ip = nextIp()
  const reg = await api('POST /shop/{s}/register', 'POST', `/shop/${b.subdomain}/register`, {
    ip,
    body: { name: `Member ${b.i}`, email, phone: '+62 812 3333 4444', password: PASSWORD },
  })
  expectStatus(area, `brand ${b.i} shopper registers`, reg, [200])
  const login = await api('POST /shop/{s}/login', 'POST', `/shop/${b.subdomain}/login`, {
    ip,
    body: { email, password: PASSWORD },
  })
  expectStatus(area, `brand ${b.i} shopper signs in`, login, [200])
  const token = login.body?.token ?? reg.body?.token
  const customerId = login.body?.customer?.id ?? reg.body?.customer?.id
  const placed: Placed[] = []
  for (let k = 0; k < 2; k++) {
    const method = k === 0 ? 'cod' : 'bank_transfer'
    const payment = b.shop.paymentTypes.find((p: any) => p.method === method && p.enabled)
    const lines = pickLines(b, 10 + k)
    const quote = await priceCart(b, lines, payment.id)
    const body = buildOrder(b, lines, payment, quote.body, null, customerId)
    const r = await api('POST /shop/{s}/orders (member)', 'POST', `/shop/${b.subdomain}/orders`, {
      token,
      body,
    })
    expectStatus(area, `brand ${b.i} signed-in shopper order ${k + 1}`, r, [200])
    if (r.status === 200) {
      const saved = r.body?.upserts?.orders?.find((o: any) => o.id === body.order.id)
      placed.push({
        orderId: body.order.id,
        code: saved?.code ?? '?',
        method,
        total: saved?.total ?? body.order.total,
        shopperToken: token,
        customerId,
        lines: body.order.lines,
        registered: true,
      })
    }
  }
  const me = await api('GET /shop/{s}/me', 'GET', `/shop/${b.subdomain}/me`, { token })
  check(
    area,
    `brand ${b.i} shopper /me lists both orders`,
    me.body?.orders?.length === 2,
    `orders=${me.body?.orders?.length}`,
  )
  return { token, customerId, placed }
}

async function tamperedOrder(b: Brand) {
  const payment = b.shop.paymentTypes.find((p: any) => p.method === 'cod')
  const lines = pickLines(b, 3)
  const quote = await priceCart(b, lines, payment.id)
  const customer = guestCustomer(b, 99)
  const body = buildOrder(b, lines, payment, quote.body, customer, customer.id)
  body.order.lines[0]!.price = 1_000
  body.order.subtotal = body.order.lines.reduce((s: number, l: any) => s + l.price * l.qty, 0)
  body.order.total = body.order.subtotal + body.order.shipping
  const r = await api('POST /shop/{s}/orders (tampered)', 'POST', `/shop/${b.subdomain}/orders`, {
    body,
    ip: nextIp(),
  })
  check(
    'checkout',
    `brand ${b.i} tampered price answers 409 PRICE_CHANGED`,
    r.status === 409 && r.body?.code === 'PRICE_CHANGED',
    excerpt(r),
  )
}

async function voucherChecks(b: Brand, other: Brand) {
  const own = await api(
    'GET /shop/{s}/vouchers/{code}',
    'GET',
    `/shop/${b.subdomain}/vouchers/${b.voucher}`,
    { ip: nextIp() },
  )
  expectStatus('checkout', `brand ${b.i} own voucher opens`, own, [200])
  const foreign = await api(
    'GET /shop/{s}/vouchers/{code}',
    'GET',
    `/shop/${b.subdomain}/vouchers/${other.voucher}`,
    { ip: nextIp() },
  )
  check(
    'isolation',
    `store ${b.i} refuses brand ${other.i}'s voucher with 404`,
    foreign.status === 404,
    excerpt(foreign),
  )
  // The same foreign code typed at checkout must not price.
  const payment = b.shop.paymentTypes.find((p: any) => p.method === 'cod')
  const lines = pickLines(b, 4)
  const q = await api('POST /shop/{s}/price', 'POST', `/shop/${b.subdomain}/price`, {
    body: {
      lines: lines.map((l) => ({
        productId: l.productId,
        categoryId: l.categoryId,
        qty: l.qty,
        unitPrice: l.price,
      })),
      code: other.voucher,
      paymentTypeId: payment.id,
    },
  })
  check(
    'isolation',
    `store ${b.i} pricing ignores brand ${other.i}'s voucher`,
    q.status === 200 && (q.body?.discount ?? 0) === 0,
    excerpt(q),
  )
}

// --- order processing ---

async function orderOf(b: Brand, orderId: string) {
  const r = await api('GET /orders/{id}', 'GET', `/orders/${orderId}?tenantId=${b.tenantId}`, {
    token: b.token,
  })
  return r.body
}

async function advanceTo(b: Brand, p: Placed, target: string) {
  for (let step = 0; step < 8; step++) {
    const o = await orderOf(b, p.orderId)
    if (!o || o.status === target) return o
    const r = await api('POST /orders/{id}/advance', 'POST', `/orders/${p.orderId}/advance`, {
      token: b.token,
      body: { trackingNo: `TRK${RUN}${p.code}`.replace(/[^A-Z0-9]/gi, '') },
    })
    if (r.status !== 200) {
      check('process', `brand ${b.i} advances ${p.code} from ${o.status}`, false, excerpt(r))
      return o
    }
  }
  return orderOf(b, p.orderId)
}

async function processBrand(b: Brand) {
  const area = 'process'
  const transfers = b.orders.filter((o) => o.method === 'bank_transfer')
  // Shoppers report their transfers, staff confirm all but the last, which is rejected once and then confirmed.
  await Promise.all(
    transfers.map(async (p) => {
      const sub = await api(
        'POST /shop/{s}/orders/{id}/payment-confirmation',
        'POST',
        `/shop/${b.subdomain}/orders/${p.orderId}/payment-confirmation`,
        {
          token: p.shopperToken,
          body: {
            amount: p.total,
            channel: 'BCA',
            senderName: 'E2E Shopper',
            transferredAt: new Date().toISOString().slice(0, 10),
          },
        },
      )
      expectStatus(area, `brand ${b.i} shopper confirms transfer of ${p.code}`, sub, [200])
    }),
  )
  for (const p of transfers) {
    const r = await api('POST /orders/{id}/payment/confirm', 'POST', `/orders/${p.orderId}/payment/confirm`, {
      token: b.token,
    })
    expectStatus(area, `brand ${b.i} staff confirms payment of ${p.code}`, r, [200])
    const o = await orderOf(b, p.orderId)
    check(
      area,
      `brand ${b.i} ${p.code} is paid after confirmation`,
      o?.paymentStatus === 'paid',
      `payment=${o?.paymentStatus} status=${o?.status}`,
    )
  }
  // One paid transfer order is cancelled and refunded by hand with proof.
  const toCancel = transfers.find((p) => !p.registered)
  if (toCancel) {
    const c = await api('POST /orders/{id}/cancel', 'POST', `/orders/${toCancel.orderId}/cancel`, {
      token: b.token,
      body: { reason: 'customer_request', note: 'shopper changed plans' },
    })
    expectStatus(area, `brand ${b.i} cancels paid order ${toCancel.code}`, c, [200])
    let o = await orderOf(b, toCancel.orderId)
    check(
      area,
      `brand ${b.i} cancelled paid order owes a refund`,
      o?.status === 'cancelled' && o?.cancelRefund?.status !== undefined,
      `status=${o?.status} cancelRefund=${JSON.stringify(o?.cancelRefund)}`,
    )
    const rf = await api(
      'POST /orders/{id}/cancel-refund',
      'POST',
      `/orders/${toCancel.orderId}/cancel-refund`,
      {
        token: b.token,
        body: {
          method: 'manual',
          reference: `TRF-${RUN}-${b.i}`,
          refundedOn: new Date().toISOString().slice(0, 10),
        },
      },
    )
    expectStatus(area, `brand ${b.i} records the manual refund proof`, rf, [200])
    o = await orderOf(b, toCancel.orderId)
    check(
      area,
      `brand ${b.i} cancelled order closes as refunded`,
      o?.status === 'refunded' || o?.cancelRefund?.status === 'refunded',
      `status=${o?.status} cancelRefund=${JSON.stringify(o?.cancelRefund)}`,
    )
  }
  // Everything else ships and arrives.
  const rest = b.orders.filter((p) => p !== toCancel)
  await Promise.all(
    rest.map(async (p) => {
      const o = await advanceTo(b, p, 'delivered')
      check(
        area,
        `brand ${b.i} ${p.code} (${p.method}) reaches delivered`,
        o?.status === 'delivered',
        `status=${o?.status}`,
      )
    }),
  )
}

async function returnFlow(b: Brand, member: { token: string; customerId: string; placed: Placed[] }) {
  const area = 'process'
  const p = member.placed[0]
  if (!p) return
  p.lineUnit = p.lines[0]!.price
  const retId = id('ret')
  const r = await api('POST /shop/{s}/returns', 'POST', `/shop/${b.subdomain}/returns`, {
    token: member.token,
    body: {
      id: retId,
      orderId: p.orderId,
      items: [{ variantId: p.lines[0]!.variantId, qty: 1, reason: 'size_or_fit' }],
      note: 'too small',
    },
  })
  expectStatus(area, `brand ${b.i} shopper asks for a return within the window`, r, [200])
  const ret = r.body?.upserts?.returns?.[0]
  if (r.status !== 200 || !ret) return
  const a = await api('POST /returns/{id}/approve', 'POST', `/returns/${ret.id}/approve`, {
    token: b.token,
    body: { note: 'ok' },
  })
  expectStatus(area, `brand ${b.i} approves the return`, a, [200])
  const rc = await api('POST /returns/{id}/receive', 'POST', `/returns/${ret.id}/receive`, {
    token: b.token,
    body: { restock: true },
  })
  expectStatus(area, `brand ${b.i} receives the return`, rc, [200])
  const rf = await api('POST /returns/{id}/refund', 'POST', `/returns/${ret.id}/refund`, {
    token: b.token,
    body: {
      amount: p.lineUnit ?? 0,
      note: 'refund one unit',
      method: 'manual',
      reference: `RET-${RUN}-${b.i}`,
      refundedOn: new Date().toISOString().slice(0, 10),
    },
  })
  expectStatus(area, `brand ${b.i} refunds the return`, rf, [200])
  const fin = rf.body?.upserts?.returns?.[0]
  check(area, `brand ${b.i} return ends refunded`, fin?.status === 'refunded', `status=${fin?.status}`)
}

// --- isolation ---

async function isolation(
  a: Brand,
  b: Brand,
  shopperA: string,
  demo: { token: string; tenantId: string } | null,
) {
  const area = 'isolation'
  const tag = `owner ${a.i} -> brand ${b.i}`
  const bOrder = b.orders[0]!
  const bOrderBefore = await orderOf(b, bOrder.orderId)
  const deny = [401, 403, 404]
  const reads: [string, string][] = [
    ['GET /orders/{id}', `/orders/${bOrder.orderId}?tenantId=${b.tenantId}`],
    ['GET /orders/{id}', `/orders/${bOrder.orderId}?tenantId=${a.tenantId}`],
    ['GET /orders', `/orders?tenantId=${b.tenantId}`],
    ['GET /customers', `/customers?tenantId=${b.tenantId}`],
    ['GET /customers/{id}', `/customers/${bOrder.customerId}?tenantId=${a.tenantId}`],
    ['GET /products', `/products?tenantId=${b.tenantId}`],
    ['GET /products/{id}', `/products/${b.products[0].id}?tenantId=${a.tenantId}`],
    ['GET /stock', `/stock?tenantId=${b.tenantId}`],
    ['GET /payment-types', `/payment-types?tenantId=${b.tenantId}`],
    ['GET /views/orders', `/views/orders?tenantId=${b.tenantId}`],
    ['GET /views/customers', `/views/customers?tenantId=${b.tenantId}`],
    ['GET /views/customer-summary', `/views/customer-summary?tenantId=${b.tenantId}`],
    ['GET /views/returns', `/views/returns?tenantId=${b.tenantId}`],
    [
      'GET /views/customer-events',
      `/views/customer-events?tenantId=${b.tenantId}&customerId=${bOrder.customerId}`,
    ],
    ['GET /audit-log', `/audit-log?tenantId=${b.tenantId}`],
    ['GET /audit-log/export.csv', `/audit-log/export.csv?tenantId=${b.tenantId}`],
    ['GET /orders/{id}/invoice.pdf', `/orders/${bOrder.orderId}/invoice.pdf?tenantId=${b.tenantId}`],
    ['GET /orders/{id}/invoice.pdf', `/orders/${bOrder.orderId}/invoice.pdf?tenantId=${a.tenantId}`],
    ['GET /orders/{id}/payment', `/orders/${bOrder.orderId}/payment?tenantId=${a.tenantId}`],
    ['GET /media', `/media?tenantId=${b.tenantId}`],
    ['GET /tenants/{id}/plan', `/tenants/${b.tenantId}/plan`],
    ['GET /tenants/{id}/domain', `/tenants/${b.tenantId}/domain`],
    ['GET /tenants/{id}/webhooks', `/tenants/${b.tenantId}/webhooks`],
    ['GET /tenants/{id}/credentials', `/tenants/${b.tenantId}/credentials`],
    ['GET /products/export.csv', `/products/export.csv?tenantId=${b.tenantId}`],
    ['GET /customers/{id}/export', `/customers/${bOrder.customerId}/export`],
    ['GET /users/events', `/users/events?tenantId=${b.tenantId}`],
  ]
  for (const [step, path] of reads) {
    const r = await api(step, 'GET', path, { token: a.token })
    const leaks =
      r.status === 200 &&
      (r.text.includes(b.tenantId) || r.text.includes(bOrder.orderId) || r.text.includes(b.products[0].id))
    check(
      area,
      `${tag}: ${path.replace(/=[^&]+/g, '=…').replace(/ten-[a-z0-9]+|ord-[a-z0-9-]+|cus-[a-z0-9-]+|prd-[a-z0-9-]+/g, '{id}')}`,
      deny.includes(r.status) || (r.status === 200 && !leaks),
      excerpt(r),
    )
  }
  // Unscoped views read only the caller's brand.
  for (const path of ['/views/orders', '/views/customers', '/views/returns', '/views/customer-summary']) {
    const r = await api(`GET ${path} (own)`, 'GET', `${path}?tenantId=${a.tenantId}`, { token: a.token })
    check(
      area,
      `${tag}: ${path} of its own brand shows no brand ${b.i} rows`,
      r.status === 200 && !r.text.includes(b.tenantId) && !r.text.includes(bOrder.orderId),
      excerpt(r),
    )
  }
  const counts = await api('GET /views/customer-counts (own)', 'GET', '/views/customer-counts', {
    token: a.token,
  })
  check(
    area,
    `${tag}: /views/customer-counts answers for its own brand`,
    counts.status === 200 && !counts.text.includes(b.tenantId),
    excerpt(counts),
  )
  const st = await api('GET /state', 'GET', '/state', { token: a.token })
  check(
    area,
    `${tag}: /state carries nothing of brand ${b.i}`,
    st.status === 200 && !st.text.includes(b.tenantId),
    '',
  )

  // Writes.
  const bp = id('prd')
  const writes: [string, string, string, unknown][] = [
    ['PUT /products/{id} (B tenant)', 'PUT', `/products/${bp}`, { ...product(b, 900, 1), id: bp }],
    [
      'PUT /products/{id} (B id, own tenant)',
      'PUT',
      `/products/${b.products[0].id}`,
      { ...b.products[0], tenantId: a.tenantId, name: 'hijacked' },
    ],
    ['POST /products/{id}/status', 'POST', `/products/${b.products[0].id}/status`, { status: 'archived' }],
    ['POST /orders/{id}/advance', 'POST', `/orders/${bOrder.orderId}/advance`, { trackingNo: 'X' }],
    [
      'POST /orders/{id}/cancel',
      'POST',
      `/orders/${bOrder.orderId}/cancel`,
      { reason: 'fraud_check', note: 'x' },
    ],
    ['POST /orders/{id}/payment/confirm', 'POST', `/orders/${bOrder.orderId}/payment/confirm`, undefined],
    ['POST /orders/{id}/notes', 'POST', `/orders/${bOrder.orderId}/notes`, { note: 'hello from A' }],
    ['POST /orders/{id}/refund', 'POST', `/orders/${bOrder.orderId}/refund`, { amount: 1000, note: 'x' }],
    ['PUT /tenants/{id}/legal', 'PUT', `/tenants/${b.tenantId}/legal`, { entityName: 'hijacked' }],
    [
      'PUT /tenants/{id}/shop-settings',
      'PUT',
      `/tenants/${b.tenantId}/shop-settings`,
      { returnWindowDays: 0, shopperEmailsOff: [] },
    ],
    ['POST /pages/{id}/unpublish', 'POST', `/pages/${b.pageId}/unpublish`, undefined],
    ['PUT /pages/{id}', 'PUT', `/pages/${b.pageId}`, { sections: [], seo: null, note: 'x' }],
    [
      'POST /stock/receive',
      'POST',
      '/stock/receive',
      {
        tenantId: a.tenantId,
        productId: b.products[0].id,
        variantId: b.products[0].variants[0].id,
        warehouseId: a.warehouseId,
        qty: 5,
        note: 'x',
      },
    ],
    [
      'POST /stock/receive (B tenant)',
      'POST',
      '/stock/receive',
      {
        tenantId: b.tenantId,
        productId: b.products[0].id,
        variantId: b.products[0].variants[0].id,
        warehouseId: b.warehouseId,
        qty: 5,
        note: 'x',
      },
    ],
    [
      'POST /orders (B tenant)',
      'POST',
      '/orders',
      {
        order: { id: id('ord'), tenantId: b.tenantId, customerId: bOrder.customerId, code: 'X' },
        customer: null,
      },
    ],
    ['DELETE /media/{id}', 'DELETE', `/media/${b.mediaId}?tenantId=${a.tenantId}`, undefined],
    [
      'POST /payment-types/{id}/toggle',
      'POST',
      `/payment-types/${b.shop.paymentTypes[0].id}/toggle`,
      undefined,
    ],
    [
      'POST /customers/{id}/points',
      'POST',
      `/customers/${bOrder.customerId}/points`,
      { points: 1000, reason: 'x' },
    ],
  ]
  const bState = await api('GET /state', 'GET', '/state', { token: b.token })
  const bLevel = bState.body?.state?.stock?.[0]
  writes.push(['POST /stock/{id}/adjust', 'POST', `/stock/${bLevel?.id}/adjust`, { delta: -1, note: 'x' }])
  for (const [step, method, path, body] of writes) {
    const r = await api(step, method, path, { token: a.token, body })
    check(area, `${tag}: write ${step} refused`, [401, 403, 404, 409, 422].includes(r.status), excerpt(r))
  }
  const bOrderAfter = await orderOf(b, bOrder.orderId)
  check(
    area,
    `${tag}: brand ${b.i}'s order is unchanged`,
    bOrderAfter?.status === bOrderBefore?.status &&
      bOrderAfter?.events?.length === bOrderBefore?.events?.length,
    `before=${bOrderBefore?.status}/${bOrderBefore?.events?.length} after=${bOrderAfter?.status}/${bOrderAfter?.events?.length}`,
  )
  const bProd = await api(
    'GET /products/{id}',
    'GET',
    `/products/${b.products[0].id}?tenantId=${b.tenantId}`,
    { token: b.token },
  )
  check(
    area,
    `${tag}: brand ${b.i}'s product is unchanged`,
    bProd.body?.tenantId === b.tenantId && bProd.body?.name !== 'hijacked' && bProd.body?.status === 'active',
    excerpt(bProd),
  )
  const bLevelAfter = (await api('GET /state', 'GET', '/state', { token: b.token })).body?.state?.stock?.find(
    (l: any) => l.id === bLevel?.id,
  )
  check(
    area,
    `${tag}: brand ${b.i}'s stock level is unchanged`,
    bLevelAfter?.onHand === bLevel?.onHand,
    `${bLevel?.onHand} -> ${bLevelAfter?.onHand}`,
  )

  // Shopper of A against B.
  const s = `shopper of ${a.i} -> store ${b.i}`
  const sReads: [string, string, string, unknown][] = [
    ['GET /shop/{s}/me', 'GET', `/shop/${b.subdomain}/me`, undefined],
    [
      'GET /shop/{s}/orders/{id}/invoice.pdf',
      'GET',
      `/shop/${b.subdomain}/orders/${bOrder.orderId}/invoice.pdf`,
      undefined,
    ],
    [
      'GET /shop/{s}/orders/{id}/invoice.pdf',
      'GET',
      `/shop/${a.subdomain}/orders/${bOrder.orderId}/invoice.pdf`,
      undefined,
    ],
    ['GET /shop/{s}/export', 'GET', `/shop/${b.subdomain}/export`, undefined],
    [
      'POST /shop/{s}/orders/{id}/payment-confirmation',
      'POST',
      `/shop/${a.subdomain}/orders/${bOrder.orderId}/payment-confirmation`,
      { amount: 1, channel: 'x', senderName: 'x', transferredAt: '2026-01-01' },
    ],
    [
      'POST /shop/{s}/orders/{id}/payment-confirmation',
      'POST',
      `/shop/${b.subdomain}/orders/${bOrder.orderId}/payment-confirmation`,
      { amount: 1, channel: 'x', senderName: 'x', transferredAt: '2026-01-01' },
    ],
    [
      'POST /shop/{s}/returns',
      'POST',
      `/shop/${a.subdomain}/returns`,
      {
        id: id('ret'),
        orderId: bOrder.orderId,
        items: [{ variantId: bOrder.lines[0]!.variantId, qty: 1, reason: 'damaged' }],
        note: 'x',
      },
    ],
    ['GET /state (shopper token)', 'GET', '/state', undefined],
    ['GET /orders (shopper token)', 'GET', `/orders?tenantId=${a.tenantId}`, undefined],
  ]
  for (const [step, method, path, body] of sReads) {
    const r = await api(step, method, path, { token: shopperA, body })
    const leaks = r.status === 200 && r.text.includes(bOrder.orderId)
    check(
      area,
      `${s}: ${step} ${path.includes(a.subdomain) ? '(own store)' : ''}`.trim(),
      [401, 403, 404, 422].includes(r.status) && !leaks,
      excerpt(r),
    )
  }
  // Search on A never finds B's products.
  const search = await api('GET /shop/{s}/search', 'GET', `/shop/${a.subdomain}/search?q=${b.word}`, {
    ip: nextIp(),
  })
  check(
    area,
    `store ${a.i} search for "${b.word}" finds nothing of brand ${b.i}`,
    search.status === 200 && (search.body?.total ?? 0) === 0 && !search.text.includes(b.tenantId),
    excerpt(search),
  )
  const sug = await api(
    'GET /shop/{s}/suggest',
    'GET',
    `/shop/${a.subdomain}/suggest?q=${b.word.slice(0, 4)}`,
    { ip: nextIp() },
  )
  check(
    area,
    `store ${a.i} suggest for "${b.word.slice(0, 4)}" finds nothing of brand ${b.i}`,
    sug.status === 200 && !(sug.body?.products ?? []).length,
    excerpt(sug),
  )

  // The seeded demo brand: its admin cannot reach the new brand, and the new owner cannot reach it.
  if (demo) {
    const r1 = await api(
      'GET /orders/{id} (demo admin)',
      'GET',
      `/orders/${bOrder.orderId}?tenantId=${b.tenantId}`,
      { token: demo.token },
    )
    check(area, `demo admin -> brand ${b.i} order refused`, [403, 404].includes(r1.status), excerpt(r1))
    const r2 = await api(
      'GET /views/orders (new owner -> demo)',
      'GET',
      `/views/orders?tenantId=${demo.tenantId}`,
      { token: a.token },
    )
    check(area, `owner ${a.i} -> demo brand orders refused`, [403, 404].includes(r2.status), excerpt(r2))
  }
}

// Cross-brand references inside writes a brand may make, and the activation rule on a direct save.
async function crossReferences(a: Brand, b: Brand) {
  const area = 'isolation'
  // A guest in store A orders brand B's product.
  const payment = a.shop.paymentTypes.find((p: any) => p.method === 'cod')
  const bp = b.shop.products[0]
  const foreignLines = [
    {
      productId: bp.id,
      categoryId: bp.categoryId,
      variantId: bp.variants[0].id,
      qty: 1,
      price: bp.variants[0].price,
    },
  ]
  const quote = { subtotal: bp.variants[0].price, discount: 0, discounts: [], freeShipping: false }
  const c1 = guestCustomer(a, 201)
  const o1 = buildOrder(a, foreignLines, payment, quote, c1, c1.id)
  const r1 = await api('POST /shop/{s}/orders (foreign product)', 'POST', `/shop/${a.subdomain}/orders`, {
    body: o1,
    ip: nextIp(),
  })
  check(
    area,
    `store ${a.i} refuses an order for brand ${b.i}'s product`,
    [404, 409, 422].includes(r1.status),
    excerpt(r1),
  )
  // A guest in store A ships from brand B's warehouse.
  const lines = pickLines(a, 7)
  const q2 = await priceCart(a, lines, payment.id)
  const c2 = guestCustomer(a, 202)
  const o2 = buildOrder(a, lines, payment, q2.body, c2, c2.id)
  o2.order.warehouseId = b.warehouseId
  const r2 = await api('POST /shop/{s}/orders (foreign warehouse)', 'POST', `/shop/${a.subdomain}/orders`, {
    body: o2,
    ip: nextIp(),
  })
  check(
    area,
    `store ${a.i} refuses an order shipped from brand ${b.i}'s warehouse`,
    [404, 409, 422].includes(r2.status),
    excerpt(r2),
  )
  if (r2.status === 200)
    a.orders.push({
      orderId: o2.order.id,
      code: '?',
      method: 'cod',
      total: o2.order.total,
      shopperToken: r2.body?.token,
      customerId: c2.id,
      lines: o2.order.lines,
      registered: false,
    })
  // A guest in store A pays with brand B's payment type.
  const c3 = guestCustomer(a, 203)
  const bPay = b.shop.paymentTypes.find((p: any) => p.method === 'cod')
  const o3 = buildOrder(a, lines, bPay, q2.body, c3, c3.id)
  const r3 = await api(
    'POST /shop/{s}/orders (foreign payment type)',
    'POST',
    `/shop/${a.subdomain}/orders`,
    { body: o3, ip: nextIp() },
  )
  check(
    area,
    `store ${a.i} refuses an order paid with brand ${b.i}'s payment type`,
    [404, 409, 422].includes(r3.status),
    excerpt(r3),
  )
  if (r3.status === 200)
    a.orders.push({
      orderId: o3.order.id,
      code: '?',
      method: 'cod',
      total: o3.order.total,
      shopperToken: r3.body?.token,
      customerId: c3.id,
      lines: o3.order.lines,
      registered: false,
    })
  // The store's own payment type, switched off, and then capped below the cart.
  const cod = a.shop.paymentTypes.find((p: any) => p.method === 'cod')
  const off = await api('POST /payment-types/{id}/toggle', 'POST', `/payment-types/${cod.id}/toggle`, {
    token: a.token,
  })
  expectStatus('setup', `owner ${a.i} switches cash on delivery off`, off, [200])
  await shopState(a)
  const c4 = guestCustomer(a, 204)
  const o4 = buildOrder(a, lines, { ...cod, enabled: false }, q2.body, c4, c4.id)
  const r6 = await api(
    'POST /shop/{s}/orders (disabled payment type)',
    'POST',
    `/shop/${a.subdomain}/orders`,
    { body: o4, ip: nextIp() },
  )
  check(
    'checkout',
    `store ${a.i} refuses an order with its switched-off payment type`,
    r6.status !== 200,
    excerpt(r6),
  )
  if (r6.status === 200)
    a.orders.push({
      orderId: o4.order.id,
      code: '?',
      method: 'cod',
      total: o4.order.total,
      shopperToken: r6.body?.token,
      customerId: c4.id,
      lines: o4.order.lines,
      registered: false,
    })
  await api('POST /payment-types/{id}/toggle', 'POST', `/payment-types/${cod.id}/toggle`, { token: a.token })
  const capped = await api('PUT /payment-types/{id}', 'PUT', `/payment-types/${cod.id}`, {
    token: a.token,
    body: { ...cod, enabled: true, maxAmount: 50_000 },
  })
  expectStatus('setup', `owner ${a.i} caps cash on delivery at Rp 50.000`, capped, [200])
  await shopState(a)
  const c5 = guestCustomer(a, 205)
  const o5 = buildOrder(a, lines, cod, q2.body, c5, c5.id)
  const r7 = await api('POST /shop/{s}/orders (over payment max)', 'POST', `/shop/${a.subdomain}/orders`, {
    body: o5,
    ip: nextIp(),
  })
  check(
    'checkout',
    `store ${a.i} refuses a Rp ${o5.order.total} order over its Rp 50.000 COD cap`,
    r7.status !== 200,
    excerpt(r7),
  )
  if (r7.status === 200)
    a.orders.push({
      orderId: o5.order.id,
      code: '?',
      method: 'cod',
      total: o5.order.total,
      shopperToken: r7.body?.token,
      customerId: c5.id,
      lines: o5.order.lines,
      registered: false,
    })
  await api('PUT /payment-types/{id}', 'PUT', `/payment-types/${cod.id}`, {
    token: a.token,
    body: { ...cod, enabled: true, maxAmount: null },
  })
  await shopState(a)
  // Owner A files a product under brand B's category.
  const p = { ...product(a, 960, 1), categoryId: b.categoryId }
  const r4 = await api('PUT /products/{id} (foreign category)', 'PUT', `/products/${p.id}`, {
    token: a.token,
    body: p,
  })
  if (r4.status === 200)
    notes.push(
      `Owner ${a.i} saved a product whose categoryId is brand ${b.i}'s category (${b.categoryId}): accepted with 200`,
    )
  check(
    area,
    `owner ${a.i} cannot file a product under brand ${b.i}'s category`,
    r4.status !== 200,
    excerpt(r4),
  )
  // A product saved straight as active skips the activation rule (no variants, no price).
  const bare = { ...product(a, 961, 1), status: 'active', variants: [], options: [], price: 0 }
  const r5 = await api('PUT /products/{id} (active, no variants)', 'PUT', `/products/${bare.id}`, {
    token: a.token,
    body: bare,
  })
  check(
    'setup',
    `owner ${a.i} cannot save a product as active with no variants and no price`,
    r5.status !== 200,
    excerpt(r5),
  )
  for (const pid of [p.id, bare.id]) {
    await api('POST /products/{id}/status', 'POST', `/products/${pid}/status`, {
      token: a.token,
      body: { status: 'archived' },
    })
  }
}

// --- sequencing ---

async function sequencing(brands: Brand[]) {
  const area = 'sequence'
  const tenantCodes = brands.map((b) => b.code)
  check(
    area,
    'tenant codes are distinct across concurrent sign-ups',
    new Set(tenantCodes).size === tenantCodes.length,
    tenantCodes.join(', '),
  )
  for (const b of brands) {
    const ol = await api('GET /orders (list)', 'GET', `/orders?tenantId=${b.tenantId}&limit=200`, {
      token: b.token,
    })
    const cl = await api('GET /customers (list)', 'GET', `/customers?tenantId=${b.tenantId}&limit=200`, {
      token: b.token,
    })
    const orders = (ol.body?.items ?? []).filter((o: any) => o.tenantId === b.tenantId)
    check(
      area,
      `brand ${b.i} order list holds every placed order`,
      orders.length === b.orders.length,
      `${orders.length} listed, ${b.orders.length} placed`,
    )
    const codes = orders.map((o: any) => o.code)
    check(
      area,
      `brand ${b.i} order codes are unique (${codes.length})`,
      new Set(codes).size === codes.length,
      codes.join(','),
    )
    const nums = codes.map((c: string) => Number(c.split('-').pop())).sort((x: number, y: number) => x - y)
    check(
      area,
      `brand ${b.i} order codes run 1..${nums.length} without gaps`,
      nums.every((n: number, k: number) => n === k + 1),
      nums.join(','),
    )
    check(
      area,
      `brand ${b.i} order codes carry its prefix`,
      codes.every((c: string) => c.startsWith(`${b.code}-`)),
      codes.join(','),
    )
    const customers = (cl.body?.items ?? []).filter((c: any) => c.tenantId === b.tenantId)
    const ccodes = customers.map((c: any) => c.code)
    check(
      area,
      `brand ${b.i} customer codes are unique (${ccodes.length})`,
      new Set(ccodes).size === ccodes.length,
      ccodes.join(','),
    )
    // Invoices for every order at once; numbers must be unique and repeat on a second download.
    const first = await Promise.all(
      orders.map((o: any) =>
        api('GET /orders/{id}/invoice.pdf', 'GET', `/orders/${o.id}/invoice.pdf?tenantId=${b.tenantId}`, {
          token: b.token,
        }),
      ),
    )
    const bad = first.filter((r) => r.status !== 200)
    check(area, `brand ${b.i} every invoice renders`, bad.length === 0, bad.map(excerpt).join(' | '))
    const names = first.map(
      (r) => /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? '',
    )
    check(
      area,
      `brand ${b.i} invoice numbers are unique under concurrency`,
      new Set(names).size === names.length,
      names.join(','),
    )
    const again = await api(
      'GET /orders/{id}/invoice.pdf',
      'GET',
      `/orders/${orders[0].id}/invoice.pdf?tenantId=${b.tenantId}`,
      { token: b.token },
    )
    const againName = /filename="([^"]+)"/.exec(again.headers.get('content-disposition') ?? '')?.[1]
    check(
      area,
      `brand ${b.i} invoice number is stable on re-download`,
      againName === names[0],
      `${names[0]} vs ${againName}`,
    )
    notes.push(
      `brand ${b.i} (${b.code}) orders: ${codes.join(',')} | customers: ${ccodes.join(',')} | invoices: ${names.join(',')}`,
    )
  }
}

// --- report ---

function pct(values: number[], p: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((x, y) => x - y)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!
}

function report() {
  console.log('\n=== Latency per step (ms) ===')
  const byStep = new Map<string, Sample[]>()
  for (const s of samples) byStep.set(s.step, [...(byStep.get(s.step) ?? []), s])
  const rows = [...byStep.entries()].sort((x, y) => y[1].length - x[1].length)
  console.log(
    `${'step'.padEnd(52)} ${'n'.padStart(5)} ${'p50'.padStart(7)} ${'p95'.padStart(7)} ${'max'.padStart(7)}  statuses`,
  )
  for (const [step, list] of rows) {
    const ms = list.map((s) => s.ms)
    const statuses = new Map<number, number>()
    for (const s of list) statuses.set(s.status, (statuses.get(s.status) ?? 0) + 1)
    console.log(
      `${step.slice(0, 52).padEnd(52)} ${String(list.length).padStart(5)} ${pct(ms, 50).toFixed(0).padStart(7)} ${pct(ms, 95).toFixed(0).padStart(7)} ${Math.max(
        ...ms,
      )
        .toFixed(0)
        .padStart(7)}  ${[...statuses].map(([k, v]) => `${k}:${v}`).join(' ')}`,
    )
  }
  const statusTotals = new Map<number, number>()
  for (const s of samples) statusTotals.set(s.status, (statusTotals.get(s.status) ?? 0) + 1)
  console.log(
    `\nRequests: ${samples.length}  by status: ${[...statusTotals]
      .sort()
      .map(([k, v]) => `${k}:${v}`)
      .join(' ')}`,
  )

  console.log('\n=== Checks by area ===')
  const areas = new Map<string, Check[]>()
  for (const c of checks) areas.set(c.area, [...(areas.get(c.area) ?? []), c])
  for (const [area, list] of areas) {
    const failed = list.filter((c) => !c.ok)
    console.log(
      `${area.padEnd(12)} ${String(list.length - failed.length).padStart(4)} passed ${String(failed.length).padStart(4)} failed`,
    )
  }
  const failed = checks.filter((c) => !c.ok)
  console.log(`\nTOTAL ${checks.length - failed.length}/${checks.length} passed`)
  if (failed.length) {
    console.log('\n=== Failures ===')
    for (const c of failed) console.log(`[${c.area}] ${c.name}\n    ${c.detail}`)
  }
  if (notes.length) {
    console.log('\n=== Notes ===')
    for (const n of notes) console.log(`- ${n}`)
  }
}

// --- main ---

async function main() {
  console.log(`run ${RUN} against ${BASE}`)
  const health = await api('GET /health', 'GET', '/health')
  if (health.status !== 200) throw new Error(`API not reachable: ${excerpt(health)}`)

  // 1. Sign-ups: five at once, a honeypot, a race for one subdomain.
  console.log('1. sign-ups')
  const honeypot = await api('signup (honeypot)', 'POST', '/auth/signup', {
    ip: nextIp(),
    body: {
      storeName: 'Bot Shop',
      subdomain: `e2e${RUN}bot`,
      industry: 'sport',
      templateId: 'tpl-minimal',
      ownerName: 'Bot',
      email: `bot.${RUN}@example.com`,
      password: PASSWORD,
      website: 'http://spam.example',
    },
  })
  check('signup', 'a filled honeypot is refused with 422', honeypot.status === 422, excerpt(honeypot))
  const botStore = await api('GET /signup/subdomain', 'GET', `/signup/subdomain?name=e2e${RUN}bot`, {
    ip: nextIp(),
  })
  check(
    'signup',
    'the honeypot sign-up left no store behind',
    botStore.body?.available === true,
    excerpt(botStore),
  )
  const results = await Promise.all([0, 1, 2, 3, 4].map(signUp))
  const brands = results.filter((b): b is Brand => b !== null)
  const race = await Promise.all(
    [0, 1].map((k) =>
      api('signup (race)', 'POST', '/auth/signup', {
        ip: nextIp(),
        body: {
          storeName: `Race ${RUN} ${k}`,
          subdomain: `e2e${RUN}race`,
          industry: 'fnb',
          templateId: 'tpl-minimal',
          ownerName: 'Racer',
          email: `race${k}.${RUN}@example.com`,
          password: PASSWORD,
        },
      }),
    ),
  )
  const raceOk = race.filter((r) => r.status === 200).length
  check(
    'signup',
    'two sign-ups for one subdomain: exactly one wins, the other gets 409/422',
    raceOk === 1 && race.some((r) => [409, 422].includes(r.status)),
    race.map(excerpt).join(' | '),
  )
  const dup = await api('signup (same email)', 'POST', '/auth/signup', {
    ip: nextIp(),
    body: {
      storeName: `Dup ${RUN}`,
      subdomain: `e2e${RUN}dup`,
      industry: 'fnb',
      templateId: 'tpl-minimal',
      ownerName: 'Dup',
      email: brands[0]!.email,
      password: PASSWORD,
    },
  })
  check(
    'signup',
    'a second store with an existing owner email is refused',
    [409, 422].includes(dup.status),
    excerpt(dup),
  )
  // Per-IP rate limit: six sign-ups from one address, the sixth is refused.
  const ip = nextIp()
  const limited: number[] = []
  for (let k = 0; k < 6; k++) {
    const r = await api('signup (rate)', 'POST', '/auth/signup', {
      ip,
      body: {
        storeName: `Rate ${RUN} ${k}`,
        subdomain: `e2e${RUN}r${k}`,
        industry: 'fnb',
        templateId: 'tpl-bogus',
        ownerName: 'R',
        email: `rate${k}.${RUN}@example.com`,
        password: PASSWORD,
      },
    })
    limited.push(r.status)
  }
  check(
    'signup',
    'sign-up from one address is limited to 5 per window',
    limited[5] === 429,
    limited.join(','),
  )
  if (brands.length < 2) throw new Error('fewer than two brands signed up; stopping')

  // Demo neighbour.
  let demo: { token: string; tenantId: string } | null = null
  const demoLogin = await api('POST /auth/login (demo)', 'POST', '/auth/login', {
    ip: nextIp(),
    body: { email: 'andi@lari.co.id', password: DEMO_PASSWORD },
  })
  if (demoLogin.status === 200)
    demo = { token: demoLogin.body.token, tenantId: demoLogin.body.user.tenantIds[0] }
  else notes.push(`demo admin sign-in failed: ${excerpt(demoLogin)}`)

  // 2. Owners set up their stores at the same time.
  console.log('2. store setup')
  await Promise.all(brands.map(setUpBrand))
  await planLimits(brands[brands.length - 1]!)

  // Open the event streams before any shopper arrives.
  const staffStreams = brands.map((b) => openStream(`staff ${b.i}`, '/events', b.token))
  const shopStreams = brands.map((b) => openStream(`shop ${b.i}`, `/shop/${b.subdomain}/events`))
  const demoStream = demo ? openStream('staff demo', '/events', demo.token) : null
  await Promise.all([...staffStreams, ...shopStreams].map((s) => Promise.race([s.opened, sleep(3000)])))
  for (const s of [...staffStreams, ...shopStreams])
    check('events', `${s.label} stream opens`, s.status === 200, `status ${s.status}`)

  // 3. Shoppers in every store at the same time.
  console.log('3. shoppers')
  await Promise.all(brands.map(shopState))
  const members = new Map<number, { token: string; customerId: string; placed: Placed[] }>()
  await Promise.all(
    brands.map(async (b, bi) => {
      const guests = await Promise.all(
        [0, 1, 2, 3, 4, 5].map((k) => guestCheckout(b, k, k % 2 === 0 ? 'cod' : 'bank_transfer')),
      )
      const member = await registeredShopper(b)
      members.set(b.i, member)
      b.orders.push(...guests.filter((g): g is Placed => g !== null), ...member.placed)
      await tamperedOrder(b)
      await voucherChecks(b, brands[(bi + 1) % brands.length]!)
    }),
  )

  // 4. Owners process their orders at the same time.
  console.log('4. processing')
  await Promise.all(brands.map(processBrand))
  await Promise.all(brands.map((b) => returnFlow(b, members.get(b.i)!)))

  // 5. Isolation: each owner and shopper against the next brand.
  console.log('5. isolation')
  for (let k = 0; k < brands.length; k++) {
    const a = brands[k]!
    const b = brands[(k + 1) % brands.length]!
    const shopperA = a.orders.find((o) => !o.registered)?.shopperToken ?? ''
    await isolation(a, b, shopperA, k === 0 ? demo : null)
  }
  await crossReferences(brands[0]!, brands[1]!)
  // A shopper reading another shopper's order in the same store.
  {
    const b = brands[0]!
    const [o1, o2] = b.orders.filter((o) => !o.registered)
    const r = await api(
      'GET /shop/{s}/orders/{id}/invoice.pdf (same store)',
      'GET',
      `/shop/${b.subdomain}/orders/${o2!.orderId}/invoice.pdf`,
      { token: o1!.shopperToken },
    )
    check(
      'isolation',
      "a shopper cannot read another shopper's invoice in the same store",
      r.status === 404,
      excerpt(r),
    )
    const own = await api(
      'GET /shop/{s}/orders/{id}/invoice.pdf',
      'GET',
      `/shop/${b.subdomain}/orders/${o1!.orderId}/invoice.pdf`,
      { token: o1!.shopperToken },
    )
    check('isolation', 'a shopper reads their own invoice', own.status === 200, excerpt(own))
  }

  // Event isolation, with a quiet window: change brand 1, then check nothing of it reached the others.
  console.log('   events')
  const b1 = brands[1]!
  const marks = [...staffStreams, ...shopStreams, ...(demoStream ? [demoStream] : [])].map(
    (s) => s.frames.length,
  )
  const extra = product(b1, 950, 1)
  await api('PUT /products/{id}', 'PUT', `/products/${extra.id}`, {
    token: b1.token,
    body: { ...extra, status: 'active' },
  })
  // A removal: a category that holds nothing, created and deleted.
  const tmpCat = id('cat')
  await api('PUT /categories/{id}', 'PUT', `/categories/${tmpCat}`, {
    token: b1.token,
    body: { id: tmpCat, tenantId: b1.tenantId, name: 'tmp', description: '', parentId: null },
  })
  const del = await api('DELETE /categories/{id}', 'DELETE', `/categories/${tmpCat}`, { token: b1.token })
  expectStatus('events', 'brand 1 deletes an empty category', del, [200])
  await sleep(4000)
  const all = [...staffStreams, ...shopStreams, ...(demoStream ? [demoStream] : [])]
  all.forEach((s, k) => {
    const fresh = s.frames.slice(marks[k])
    const own = s.label.endsWith(` ${b1.i}`)
    const sawProduct = fresh.some((f) => f.includes(extra.id))
    const sawRemoval = fresh.some((f) => f.includes(tmpCat))
    if (own) {
      check('events', `${s.label} receives its own product change`, sawProduct, `${fresh.length} frames`)
      check('events', `${s.label} receives its own category removal`, sawRemoval, `${fresh.length} frames`)
    } else {
      check('events', `${s.label} does not receive brand ${b1.i}'s product`, !sawProduct, '')
      check(
        'events',
        `${s.label} does not receive brand ${b1.i}'s category removal`,
        !sawRemoval,
        fresh
          .filter((f) => f.includes(tmpCat))
          .map((f) => f.slice(0, 200))
          .join(' | '),
      )
    }
  })
  // Whole-run scan: no stream carried another new brand's tenant id or order ids.
  for (const s of all) {
    const ownIdx = brands.findIndex((b) => s.label.endsWith(` ${b.i}`))
    const others = brands.filter((_, k) => k !== ownIdx)
    const leaked = s.frames.filter((f) =>
      others.some((b) => f.includes(b.tenantId) || b.orders.some((o) => f.includes(o.orderId))),
    )
    check(
      'events',
      `${s.label} stream: no rows of other brands over the whole run (${s.frames.length} frames)`,
      leaked.length === 0,
      leaked
        .slice(0, 2)
        .map((f) => f.slice(0, 240))
        .join(' | '),
    )
  }
  for (const s of shopStreams) {
    const priv = s.frames.filter((f) =>
      /"(orders|customers|returns|stockMoves|pageDrafts|users)"\s*:\s*\[\s*\{/.test(f),
    )
    check(
      'events',
      `${s.label} anonymous store stream carries no orders, customers or drafts`,
      priv.length === 0,
      priv
        .slice(0, 1)
        .map((f) => f.slice(0, 240))
        .join(''),
    )
    const costs = s.frames.filter((f) => /"cost"\s*:\s*[1-9]/.test(f))
    check(
      'events',
      `${s.label} store stream carries no product cost`,
      costs.length === 0,
      costs
        .slice(0, 1)
        .map((f) => f.slice(0, 200))
        .join(''),
    )
  }
  for (const s of staffStreams)
    check('events', `${s.label} received deltas of its own brand`, s.frames.length > 0, `${s.frames.length}`)
  for (const s of all) s.close()

  // 6. Codes and invoice numbers.
  console.log('6. sequencing')
  await sequencing(brands)

  console.log('\nBrands:')
  for (const b of brands)
    console.log(`  ${b.i} ${b.code} ${b.subdomain} ${b.tenantId} ${b.industry} orders=${b.orders.length}`)
  report()
  process.exitCode = checks.some((c) => !c.ok) ? 1 : 0
}

main().catch((err) => {
  console.error(err)
  report()
  process.exitCode = 2
})
