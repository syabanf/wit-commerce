import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MenuLink, StoreMenus } from '../../types/src/index.ts'
import { FIXTURE_NOW } from '../src/clock.ts'
import { menuEntries, menusBlocker, cleanMenus, validLink } from '../src/content.ts'
import { seedState } from '../src/data.ts'
import { type AppAction, type AppState, reduce } from '../src/store.ts'

const run = (state: AppState, action: AppAction, by: string) =>
  reduce(state, { action, meta: { by, at: FIXTURE_NOW } })
const lari = 'ten-lari'
const storeOf = (state: AppState, tenantId = lari) => ({
  pages: state.pages.filter((p) => p.tenantId === tenantId),
  categories: state.categories.filter((c) => c.tenantId === tenantId),
  collections: state.collections.filter((c) => c.tenantId === tenantId),
})
const save = (state: AppState, menus: StoreMenus, by = 'usr-maya') =>
  run(state, { type: 'menus/save', tenantId: lari, menus }, by)
const menusOf = (state: AppState) => state.tenants.find((t) => t.id === lari)!.menus

describe('store menus', () => {
  it('leaves every seed store on its theme links', () => {
    const seed = seedState()
    for (const tenant of seed.tenants) {
      assert.equal(tenant.menus, undefined, tenant.id)
      // No entries means the theme renders its fixed header and footer, as before menus existed.
      assert.deepEqual(menuEntries(tenant.menus?.header, storeOf(seed, tenant.id)), [])
      assert.deepEqual(menuEntries(tenant.menus?.footer, storeOf(seed, tenant.id)), [])
    }
  })

  it('renders a saved menu in order, with each target as a store path', () => {
    const seed = seedState()
    const category = seed.categories.find((c) => c.tenantId === lari)!
    const collection = seed.collections.find((c) => c.tenantId === lari)!
    const header: MenuLink[] = [
      { label: 'Strava', target: { kind: 'url', url: 'https://strava.com/clubs/lari' } },
      { label: 'About', target: { kind: 'page', id: 'page-lari-about' } },
      { label: 'Home', target: { kind: 'page', id: 'page-lari-home' } },
      { label: category.name, target: { kind: 'category', id: category.id } },
      { label: collection.name, target: { kind: 'collection', id: collection.id } },
      { label: 'Everything', target: { kind: 'catalog' } },
      { label: 'Cart', target: { kind: 'url', url: '/cart' } },
    ]
    const state = save(seed, { header, footer: [] })
    assert.deepEqual(
      menuEntries(menusOf(state)!.header, storeOf(state)).map((e) => [e.label, e.path, e.external]),
      [
        ['Strava', 'https://strava.com/clubs/lari', true],
        ['About', '/about', false],
        ['Home', '/', false],
        [category.name, `/c/${category.id}`, false],
        [collection.name, `/collections/${collection.slug}`, false],
        ['Everything', '/search', false],
        ['Cart', '/cart', false],
      ],
    )
  })

  it('hides unpublished pages, seller pages and targets that no longer exist', () => {
    const seed = seedState()
    const header: MenuLink[] = [
      { label: 'FAQ', target: { kind: 'page', id: 'page-lari-faq' } },
      { label: 'Trail', target: { kind: 'page', id: 'page-lari-trail' } },
      { label: 'Fahmi', target: { kind: 'page', id: 'page-sel-fahmi' } },
      { label: 'Gone', target: { kind: 'category', id: 'cat-gone' } },
      { label: 'About', target: { kind: 'page', id: 'page-lari-about' } },
    ]
    let state = save(seed, { header, footer: [] })
    assert.deepEqual(
      menuEntries(menusOf(state)!.header, storeOf(state)).map((e) => e.label),
      ['About'],
    )
    // Unpublishing About empties the menu, and the theme's own links come back.
    state = run(state, { type: 'pages/unpublish', id: 'page-lari-about' }, 'usr-maya')
    assert.deepEqual(menuEntries(menusOf(state)!.header, storeOf(state)), [])
  })

  it('refuses bad external links and empty labels, and keeps the old menus', () => {
    const seed = seedState()
    for (const url of ['javascript:alert(1)', '//evil.example', 'ftp://x', 'about', 'https://', '']) {
      const menus = { header: [{ label: 'Bad', target: { kind: 'url' as const, url } }], footer: [] }
      assert.ok(menusBlocker(cleanMenus(menus)), url)
      assert.equal(save(seed, menus), seed, url)
    }
    assert.equal(validLink('/about'), true)
    assert.equal(validLink('https://wa.me/62812'), true)
    const unlabelled = { header: [{ label: '  ', target: { kind: 'catalog' as const } }], footer: [] }
    assert.equal(menusBlocker(cleanMenus(unlabelled)), 'Give every link a label.')
    const tooMany = {
      header: Array.from({ length: 9 }, () => ({ label: 'x', target: { kind: 'catalog' as const } })),
      footer: [],
    }
    assert.equal(save(seed, tooMany), seed)
  })

  it('removes the menus when both lists are empty', () => {
    const seed = seedState()
    let state = save(seed, { header: [{ label: 'All', target: { kind: 'catalog' } }], footer: [] })
    assert.ok(menusOf(state))
    state = save(state, { header: [], footer: [] })
    assert.equal(menusOf(state), undefined)
  })
})

describe('seller profile', () => {
  const profile = (id: string, headline: string, bio = '', photoUrl = '') =>
    ({ type: 'sellers/updateProfile', id, headline, bio, photoUrl }) as const
  const sellerOf = (state: AppState, id: string) => state.sellers.find((s) => s.id === id)!
  const heroOf = (state: AppState, pageId: string) =>
    state.pages.find((p) => p.id === pageId)!.sections.find((s) => s.kind === 'hero')!

  it('lets a seller edit their own profile, and the page hero follows', () => {
    const state = run(
      seedState(),
      profile('sel-fahmi', ' Race-day shoes. ', 'Ask me about plates.'),
      'usr-fahmi',
    )
    assert.equal(sellerOf(state, 'sel-fahmi').headline, 'Race-day shoes.')
    assert.equal(heroOf(state, 'page-sel-fahmi').headline, 'Race-day shoes.')
    assert.equal(heroOf(state, 'page-sel-fahmi').body, 'Ask me about plates.')
  })

  it("refuses another seller's profile", () => {
    const seed = seedState()
    assert.equal(run(seed, profile('sel-sherlyn', 'Mine now'), 'usr-fahmi'), seed)
    assert.equal(run(seed, profile('sel-nadia', 'Mine now'), 'usr-fahmi'), seed)
  })

  it('keeps locked copy and photo for sellers, not for admins', () => {
    const seed = seedState()
    // Lari locks the hero image.
    assert.equal(run(seed, profile('sel-fahmi', 'Hi', '', '/media/ten-lari/med-a.png'), 'usr-fahmi'), seed)
    const byAdmin = run(seed, profile('sel-fahmi', 'Hi', '', '/media/ten-lari/med-a.png'), 'usr-andi')
    assert.equal(sellerOf(byAdmin, 'sel-fahmi').photoUrl, '/media/ten-lari/med-a.png')
    const locked = run(seed, { type: 'brand/toggleLock', tenantId: lari, key: 'headline' }, 'usr-andi')
    assert.equal(run(locked, profile('sel-fahmi', 'New headline'), 'usr-fahmi'), locked)
  })

  it('refuses copy over the limits', () => {
    const seed = seedState()
    assert.equal(run(seed, profile('sel-fahmi', 'x'.repeat(81)), 'usr-andi'), seed)
    assert.equal(run(seed, profile('sel-fahmi', 'ok', 'x'.repeat(401)), 'usr-andi'), seed)
  })
})
