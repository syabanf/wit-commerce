import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Page } from '../../types/src/index.ts'
import { AA, contrastRatio } from '../../../apps/admin/src/pages/brand/lib.ts'
import { launchChecklist } from '../../../apps/admin/src/pages/dashboard/launch.ts'
import { brandVars } from '../../../apps/storefront/src/lib/brand.ts'
import { BRAND_FONT_STACK, DEFAULT_BRAND_COLORS } from '../src/brand.ts'
import { seedState } from '../src/data.ts'
import { FONT_PAIRINGS, fontStack, googleFontsHref, pairingOf } from '../src/fonts.ts'
import { PALETTES, paletteOf } from '../src/palettes.ts'

/** The better of the background and text colours on a fill, as the storefront picks button labels. */
const labelRatio = (fill: string, c: { background: string; text: string }) =>
  Math.max(contrastRatio(fill, c.background), contrastRatio(fill, c.text))

describe('colour palettes', () => {
  it('has six named palettes, none of them the default', () => {
    assert.equal(PALETTES.length, 6)
    assert.equal(new Set(PALETTES.map((p) => p.id)).size, 6)
    assert.equal(paletteOf({ ...DEFAULT_BRAND_COLORS }), undefined)
  })

  for (const p of PALETTES) {
    it(`${p.label} passes WCAG AA`, () => {
      const c = p.colors
      assert.ok(contrastRatio(c.text, c.background) >= AA, 'text on background')
      assert.ok(contrastRatio(c.primary, 'white') >= AA, 'white on primary')
      assert.ok(labelRatio(c.primary, c) >= AA, 'label on primary')
      assert.ok(labelRatio(c.secondary, c) >= AA, 'label on secondary')
      assert.ok(labelRatio(c.accent, c) >= AA, 'label on accent')
    })
  }

  it('matches a palette whatever the hex case', () => {
    const fresh = PALETTES[0]!
    const upper = Object.fromEntries(Object.entries(fresh.colors).map(([k, v]) => [k, v.toUpperCase()]))
    assert.equal(paletteOf(upper as typeof fresh.colors)?.id, fresh.id)
  })
})

describe('font pairings', () => {
  it('keeps DM Sans as the default and for unknown names', () => {
    assert.equal(FONT_PAIRINGS[0]?.id, 'modern')
    assert.equal(fontStack('DM Sans'), BRAND_FONT_STACK)
    assert.equal(fontStack(undefined), BRAND_FONT_STACK)
    assert.equal(fontStack('Comic Sans MS'), BRAND_FONT_STACK)
    assert.equal(fontStack('Playfair Display').startsWith("'Playfair Display', "), true)
  })

  it('loads only the extra families, with display=swap', () => {
    assert.equal(googleFontsHref(['DM Sans', 'DM Sans']), null)
    assert.equal(googleFontsHref(['Unknown']), null)
    const href = googleFontsHref(['Playfair Display', 'Source Sans 3', 'Playfair Display'])
    assert.ok(href?.startsWith('https://fonts.googleapis.com/css2?'))
    assert.ok(href?.endsWith('&display=swap'))
    assert.equal(href?.match(/family=Playfair\+Display/g)?.length, 1)
    assert.ok(href?.includes('family=Source+Sans+3'))
    for (const p of FONT_PAIRINGS) assert.equal(pairingOf({ ...p.fonts })?.id, p.id)
  })

  it('leaves every demo store in DM Sans', () => {
    for (const t of seedState().tenants) {
      const vars = brandVars(t.brand)
      assert.equal(vars['--sf-heading'], BRAND_FONT_STACK, t.id)
      assert.equal(vars['--sf-body'], BRAND_FONT_STACK, t.id)
      assert.equal(vars['--sf-serif'], BRAND_FONT_STACK, t.id)
      assert.equal(googleFontsHref([t.brand.fonts.heading, t.brand.fonts.body]), null, t.id)
    }
  })

  it('sets the chosen pair on the storefront', () => {
    const brand = {
      ...seedState().tenants[0]!.brand,
      fonts: { heading: 'Playfair Display', body: 'Source Sans 3' },
    }
    const vars = brandVars(brand)
    assert.equal(vars['--sf-heading'], fontStack('Playfair Display'))
    assert.equal(vars['--sf-serif'], fontStack('Playfair Display'))
    assert.equal(vars['--sf-body'], fontStack('Source Sans 3'))
  })
})

describe('get your store live checklist', () => {
  const rev = {
    id: 'rev-1',
    at: '2026-10-05T02:41:00.000Z',
    by: 'u',
    note: '',
    sections: [],
    templateId: 't',
  }
  const home = (patch: Partial<Page> = {}) => ({
    kind: 'home' as const,
    status: 'draft' as const,
    revisions: [rev],
    publishedAt: null,
    ...patch,
  })
  const brand = { ...seedState().tenants[0]!.brand, colors: { ...DEFAULT_BRAND_COLORS }, logoUrl: undefined }
  const fresh = {
    tenant: { brand, onboarding: ['business', 'template', 'payment'] },
    pages: [home()],
    productCount: 0,
    emailPending: false,
  }
  const doneKeys = (r: ReturnType<typeof launchChecklist>) => r.steps.filter((s) => s.done).map((s) => s.key)

  it('starts with nothing done for a store made at sign-up', () => {
    const r = launchChecklist(fresh)
    assert.deepEqual(
      r.steps.map((s) => s.key),
      ['logo', 'colors', 'page', 'product', 'publish'],
    )
    assert.deepEqual(doneKeys(r), [])
    assert.equal(r.total, 5)
    assert.equal(r.live, false)
  })

  it('reads each step from real data', () => {
    const r = launchChecklist({
      ...fresh,
      tenant: {
        ...fresh.tenant,
        brand: { ...brand, logoUrl: '/media/t/logo.png', colors: PALETTES[1]!.colors },
      },
      pages: [home({ revisions: [rev, rev] })],
      productCount: 3,
    })
    assert.deepEqual(doneKeys(r), ['logo', 'colors', 'page', 'product'])
    assert.equal(r.done, 4)
  })

  it('counts colours as done once onboarding marked the brand step', () => {
    const r = launchChecklist({ ...fresh, tenant: { ...fresh.tenant, onboarding: ['business', 'brand'] } })
    assert.deepEqual(doneKeys(r), ['colors'])
  })

  it('shows the email step only while confirmation is pending', () => {
    const r = launchChecklist({ ...fresh, emailPending: true })
    assert.deepEqual(
      r.steps.map((s) => s.key),
      ['logo', 'colors', 'page', 'product', 'email', 'publish'],
    )
    assert.equal(r.steps.find((s) => s.key === 'email')?.to, undefined)
  })

  it('is live once a home page is published', () => {
    const r = launchChecklist({
      ...fresh,
      pages: [home({ status: 'published', publishedAt: rev.at }), { ...home(), kind: 'landing' }],
    })
    assert.equal(r.live, true)
    assert.deepEqual(doneKeys(r), ['page', 'publish'])
    assert.equal(
      launchChecklist({ ...fresh, pages: [{ ...home(), kind: 'landing', status: 'published' }] }).live,
      false,
    )
  })

  it('links each step to where it is done', () => {
    const to = Object.fromEntries(launchChecklist(fresh).steps.map((s) => [s.key, s.to]))
    assert.deepEqual(to, {
      logo: '/store/brand',
      colors: '/store/brand',
      page: '/store/editor',
      product: '/commerce/products',
      publish: '/store/editor',
    })
  })
})
