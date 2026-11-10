import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Page } from '../../types/src/index.ts'
import { FIXTURE_NOW } from '../src/clock.ts'
import { HOUR, toIso, toMs } from '../src/dates.ts'
import { seedState } from '../src/data.ts'
import { pagePublishBlocker, pageWithDraft } from '../src/rules.ts'
import { type AppAction, type AppState, reduce } from '../src/store.ts'

const at = (hours = 0) => toIso(toMs(FIXTURE_NOW) + hours * HOUR)
const run = (state: AppState, action: AppAction, hours = 0, by = 'usr-maya') =>
  reduce(state, { action, meta: { by, at: at(hours) } })
const pageOf = (state: AppState, id: string) => state.pages.find((p) => p.id === id)!
const draftOf = (state: AppState, id: string) => state.pageDrafts.find((d) => d.id === id)

const HOME = 'page-lari-home'
const withHeadline = (page: Page, headline: string): Page['sections'] =>
  page.sections.map((s) => (s.kind === 'hero' ? { ...s, headline } : s))
const save = (state: AppState, id: string, headline: string, hours = 0) =>
  run(
    state,
    { type: 'pages/save', id, sections: withHeadline(pageOf(state, id), headline), note: 'Edit' },
    hours,
  )
const heroOf = (sections: Page['sections']) => sections.find((s) => s.kind === 'hero')!.headline

describe('page drafts', () => {
  it('keeps a save to a published page in its draft and leaves the page alone', () => {
    const seed = seedState()
    const before = pageOf(seed, HOME)
    assert.equal(before.status, 'published')
    let state = save(seed, HOME, 'First edit', 1)
    assert.equal(pageOf(state, HOME), before)
    const first = draftOf(state, HOME)!
    assert.equal(heroOf(first.sections), 'First edit')
    assert.deepEqual(first.seo, before.seo)
    assert.equal(first.templateId, before.templateId)
    assert.equal(first.tenantId, before.tenantId)
    assert.equal(first.updatedBy, 'usr-maya')

    state = run(state, {
      type: 'pages/save',
      id: HOME,
      sections: first.sections.map((s) => (s.kind === 'hero' ? { ...s, headline: 'Second edit' } : s)),
      seo: { ...before.seo, title: 'New title' },
      note: 'Edit',
    })
    assert.equal(state.pageDrafts.length, 1)
    assert.equal(heroOf(draftOf(state, HOME)!.sections), 'Second edit')
    assert.equal(draftOf(state, HOME)!.seo.title, 'New title')
    assert.equal(pageOf(state, HOME), before)
  })

  it('publishes the draft with one revision and removes it', () => {
    let state = seedState()
    const before = pageOf(state, HOME)
    state = run(state, {
      type: 'pages/save',
      id: HOME,
      sections: withHeadline(before, 'Going live'),
      seo: { ...before.seo, title: 'Live title' },
      note: 'Edit',
    })
    state = run(state, { type: 'pages/publish', id: HOME }, 2)
    const live = pageOf(state, HOME)
    assert.equal(heroOf(live.sections), 'Going live')
    assert.equal(live.seo.title, 'Live title')
    assert.equal(live.publishedAt, at(2))
    assert.equal(live.revisions.length, Math.min(before.revisions.length + 1, 12))
    assert.equal(live.revisions[0]!.note, 'Published')
    assert.equal(heroOf(live.revisions[0]!.sections), 'Going live')
    assert.equal(draftOf(state, HOME), undefined)
  })

  it('adds no revision for a save to a draft, and still caps revisions at 12', () => {
    let state = seedState()
    for (let i = 0; i < 14; i++) {
      const count = pageOf(state, HOME).revisions.length
      state = save(state, HOME, `Edit ${i}`, i)
      assert.equal(pageOf(state, HOME).revisions.length, count)
      state = run(state, { type: 'pages/publish', id: HOME }, i)
    }
    assert.equal(pageOf(state, HOME).revisions.length, 12)
  })

  it('discards the draft and leaves the live page', () => {
    let state = save(seedState(), HOME, 'Never mind')
    state = run(state, { type: 'pages/discardDraft', id: HOME })
    assert.equal(state.pageDrafts.length, 0)
    assert.deepEqual(pageOf(state, HOME), pageOf(seedState(), HOME))
    assert.equal(run(state, { type: 'pages/discardDraft', id: HOME }), state)
  })

  it('switches the template and rolls back inside the draft on a live page', () => {
    let state = seedState()
    const before = pageOf(state, HOME)
    const other = state.templates.find(
      (t) =>
        t.id !== before.templateId &&
        (t.tenantId === null || t.tenantId === before.tenantId) &&
        t.scope === 'store',
    )!
    state = run(state, { type: 'pages/setTemplate', id: HOME, templateId: other.id })
    assert.equal(pageOf(state, HOME), before)
    assert.equal(draftOf(state, HOME)!.templateId, other.id)

    const rev = before.revisions[1]!
    state = run(state, { type: 'pages/rollback', id: HOME, revisionId: rev.id })
    assert.equal(pageOf(state, HOME), before)
    assert.deepEqual(draftOf(state, HOME)!.sections, rev.sections)
    assert.equal(draftOf(state, HOME)!.templateId, rev.templateId)
  })

  it('saves a page that was never published directly, as before', () => {
    const seed = seedState()
    const faq = pageOf(seed, 'page-lari-faq')
    assert.equal(faq.status, 'draft')
    const state = save(seed, faq.id, 'Straight in')
    assert.equal(heroOf(pageOf(state, faq.id).sections), 'Straight in')
    assert.equal(pageOf(state, faq.id).revisions.length, faq.revisions.length + 1)
    assert.equal(state.pageDrafts, seed.pageDrafts)
  })

  it('checks the draft, not the live page, before publishing or scheduling', () => {
    let state = seedState()
    const before = pageOf(state, HOME)
    const hidden = before.sections.map((s) => (s.kind === 'hero' ? { ...s, hidden: true } : s))
    state = run(state, { type: 'pages/save', id: HOME, sections: hidden, note: 'Hid the hero' })
    assert.equal(pagePublishBlocker(before), null)
    assert.match(pagePublishBlocker(pageWithDraft(before, draftOf(state, HOME))) ?? '', /required/)
    assert.equal(run(state, { type: 'pages/publish', id: HOME }), state)
    assert.equal(run(state, { type: 'pages/schedule', id: HOME, at: at(24) }), state)
  })

  it('keeps the draft through schedule and unpublish, and the tick publishes it', () => {
    let state = save(seedState(), HOME, 'At launch')
    state = run(state, { type: 'pages/schedule', id: HOME, at: at(5) })
    assert.ok(draftOf(state, HOME))
    state = run(state, { type: 'system/tick' }, 6, 'system')
    const live = pageOf(state, HOME)
    assert.equal(live.status, 'published')
    assert.equal(heroOf(live.sections), 'At launch')
    assert.equal(live.revisions[0]!.by, 'system')
    assert.equal(draftOf(state, HOME), undefined)

    state = save(state, HOME, 'Still waiting')
    state = run(state, { type: 'pages/unpublish', id: HOME })
    assert.equal(heroOf(draftOf(state, HOME)!.sections), 'Still waiting')
    // With unpublished changes waiting, a save to the now-draft page joins them.
    state = save(state, HOME, 'Joined the draft')
    assert.equal(heroOf(draftOf(state, HOME)!.sections), 'Joined the draft')
    assert.equal(heroOf(pageOf(state, HOME).sections), 'At launch')
  })

  it('leaves seller pages that follow the seller record as direct writes', () => {
    const state = seedState()
    const seller = state.sellers.find((s) => s.id === 'sel-fahmi')!
    const next = run(
      state,
      { type: 'sellers/save', seller: { ...seller, featuredProductIds: [] } },
      0,
      'usr-andi',
    )
    assert.equal(next.pageDrafts, state.pageDrafts)
    assert.notEqual(pageOf(next, 'page-sel-fahmi'), pageOf(state, 'page-sel-fahmi'))
  })
})
