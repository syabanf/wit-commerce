import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PageSection, Template } from '../../types/src/index.ts'
import {
  HISTORY_LIMIT,
  pushHistory,
  redo,
  startHistory,
  undo,
} from '../../../apps/admin/src/pages/store-editor/history.ts'
import { seedState } from '../src/data.ts'
import { pagePublishBlocker } from '../src/rules.ts'
import { sectionHref, sectionItems, sectionsInOrder } from '../src/sections.ts'
import { applyTemplate } from '../src/store.ts'

/** The storefront's order before the editor: template kinds first, unknown kinds after. */
function templateOrder(sections: PageSection[], template: Template | null): PageSection[] {
  if (!template) return sections
  const order = template.sections.map((s) => s.kind)
  const rank = (s: PageSection) => {
    const i = order.indexOf(s.kind)
    return i < 0 ? order.length : i
  }
  return [...sections].sort((a, b) => rank(a) - rank(b))
}

const seed = seedState()
const ids = (sections: PageSection[]) => sections.map((s) => s.id)
const visible = (sections: PageSection[]) => sections.filter((s) => !s.hidden && s.kind !== 'footer')
const templateOf = (id: string) => seed.templates.find((t) => t.id === id) ?? null

describe('section order', () => {
  it('renders every seed page exactly as before', () => {
    for (const page of seed.pages) {
      const shown = visible(page.sections)
      const template = templateOf(page.templateId)
      assert.deepEqual(ids(sectionsInOrder(shown, template)), ids(templateOrder(shown, template)), page.id)
    }
  })

  it('follows the order a page was arranged in', () => {
    const page = seed.pages.find((p) => p.id === 'page-lari-home')!
    const reversed = [...visible(page.sections)].reverse().map((s, order) => ({ ...s, order }))
    assert.deepEqual(ids(sectionsInOrder(reversed, templateOf(page.templateId))), ids(reversed))
    // Shuffled in the array, the numbers still win.
    const shuffled = [reversed[2]!, reversed[0]!, reversed[1]!, ...reversed.slice(3)]
    assert.deepEqual(ids(sectionsInOrder(shuffled, templateOf(page.templateId))), ids(reversed))
  })

  it('keeps template order for a page with a section added out of place', () => {
    const page = seed.pages.find((p) => p.id === 'page-lari-home')!
    const hero = page.sections.find((s) => s.kind === 'hero')!
    const moved = [...page.sections.filter((s) => s !== hero), hero]
    assert.equal(sectionsInOrder(moved, templateOf(page.templateId))[0]!.kind, 'hero')
  })

  it('drops a hand-made order on a template switch and keeps images, links and items', () => {
    const page = seed.pages.find((p) => p.id === 'page-lari-home')!
    const sections = page.sections.map((s, order) =>
      s.kind === 'hero'
        ? { ...s, order, imageUrl: '/media/a.png', ctaHref: '/about', items: [{ title: 'Q', body: 'A' }] }
        : { ...s, order },
    )
    const next = applyTemplate(sections, templateOf('tpl-editorial')!, page.id)
    assert.ok(next.every((s) => s.order === undefined))
    const hero = next.find((s) => s.kind === 'hero')!
    assert.equal(hero.imageUrl, '/media/a.png')
    assert.equal(hero.ctaHref, '/about')
    assert.deepEqual(hero.items, [{ title: 'Q', body: 'A' }])
    // Content without the new fields gains no keys, so saved JSON stays the same.
    assert.deepEqual(
      Object.keys(applyTemplate(page.sections, templateOf('tpl-editorial')!, page.id)[0]!).sort(),
      ['body', 'ctaLabel', 'headline', 'hidden', 'id', 'kind', 'productIds', 'rule'],
    )
  })
})

describe('section items and links', () => {
  it('uses the owner items, trimmed, and skips rows without a title', () => {
    assert.equal(sectionItems({}), null)
    assert.equal(sectionItems({ items: [{ title: '  ', body: 'x' }] }), null)
    assert.deepEqual(
      sectionItems({
        items: [
          { title: ' Do you ship? ', body: ' Yes. ' },
          { title: '', body: 'orphan' },
          { title: 'Love it', body: '' },
        ],
      }),
      [
        { title: 'Do you ship?', body: 'Yes.' },
        { title: 'Love it', body: '' },
      ],
    )
  })

  it('points store paths under the store and keeps web links', () => {
    assert.equal(sectionHref('', '/p/prd-1'), '/p/prd-1')
    assert.equal(sectionHref('/lari', '/about'), '/lari/about')
    assert.equal(sectionHref('/lari', 'https://wa.me/62812'), 'https://wa.me/62812')
    assert.equal(sectionHref('', undefined), null)
    assert.equal(sectionHref('', 'javascript:alert(1)'), null)
    assert.equal(sectionHref('', '//evil.example'), null)
  })
})

describe('publish blocker', () => {
  it('allows a home page with no products', () => {
    const page = seed.pages.find((p) => p.id === 'page-lari-home')!
    const bare = { ...page, sections: page.sections.map((s) => ({ ...s, productIds: [] })) }
    assert.equal(pagePublishBlocker(bare), null)
  })

  it('reports problems in the same order as before', () => {
    const page = seed.pages.find((p) => p.id === 'page-lari-home')!
    const broken = {
      ...page,
      seo: { title: '', description: '' },
      sections: page.sections.map((s) => (s.kind === 'hero' ? { ...s, headline: '' } : s)),
    }
    assert.equal(pagePublishBlocker(broken), 'The hero needs a headline.')
    const hidden = {
      ...broken,
      sections: broken.sections.map((s) => (s.kind === 'hero' ? { ...s, hidden: true } : s)),
    }
    assert.equal(pagePublishBlocker(hidden), 'The Hero section is required. Show it before publishing.')
  })
})

describe('editor undo and redo', () => {
  it('steps back and forward, and a new change clears redo', () => {
    let h = startHistory(0)
    h = pushHistory(h, 1)
    h = pushHistory(h, 2)
    h = undo(h)
    assert.equal(h.present, 1)
    h = redo(h)
    assert.equal(h.present, 2)
    h = undo(pushHistory(undo(h), 5))
    assert.equal(h.present, 1)
    assert.deepEqual(h.future, [5])
  })

  it('merges typing into one step and keeps the last fifty', () => {
    let h = pushHistory(startHistory('a'), 'ab')
    h = pushHistory(h, 'abc', true)
    assert.deepEqual(h.past, ['a'])
    assert.equal(undo(h).present, 'a')
    for (let i = 0; i < 80; i++) h = pushHistory(h, `v${i}`)
    assert.equal(h.past.length, HISTORY_LIMIT)
    assert.equal(undo(startHistory('x')).present, 'x')
  })
})
