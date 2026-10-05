// Self-check for the shopping assistant's intent parsing. Run: npx tsx apps/storefront/scripts/assistant-check.ts
import assert from 'node:assert/strict'
import { seedState } from '@rc/fixtures'
import { describeIntent, parseBudget, recommend, understand } from '../src/lib/assistant'
import { buildCatalog } from '../src/lib/catalog'

const state = seedState()
const catalogOf = (subdomain: string) => buildCatalog(state, state.tenants.find((t) => t.subdomain === subdomain)!)
const lari = catalogOf('lari')
const aruna = catalogOf('aruna')
const teknika = catalogOf('teknika')

const budgets: [string, number | null][] = [
  ['budget 500 ribu', 500_000],
  ['maksimal 1,5 juta', 1_500_000],
  ['max 1.5jt', 1_500_000],
  ['under 500rb', 500_000],
  ['di bawah Rp 300.000', 300_000],
  ['Sepatu running untuk 10K', null],
]
for (const [text, want] of budgets) assert.equal(parseBudget(text), want, text)

const cases = [
  { catalog: lari, text: 'Sepatu running untuk 10K budget maksimal 1,5 juta', budget: 1_500_000, category: 'cat-lari-road', useCase: '10K' },
  { catalog: aruna, text: 'Saya cari hadiah untuk ibu, budget Rp500 ribu', budget: 500_000, category: 'cat-aruna-sets', gift: true },
  { catalog: aruna, text: 'serum untuk kulit sensitif di bawah 300rb', budget: 300_000, category: 'cat-aruna-skin', useCase: 'Sensitive skin' },
  { catalog: lari, text: 'trail shoes', category: 'cat-lari-trail' },
  { catalog: aruna, text: 'sunblock', category: 'cat-aruna-skin' },
  { catalog: teknika, text: 'kompresor', category: 'cat-tek-air' },
]

for (const c of cases) {
  const intent = understand(c.text, c.catalog)
  const rec = recommend(intent, c.catalog)
  if ('budget' in c) assert.equal(intent.budgetMax, c.budget, `${c.text}: budget`)
  assert.equal(intent.categoryId, c.category, `${c.text}: category`)
  if (c.useCase) assert.ok(intent.useCases.some((u) => u.label === c.useCase), `${c.text}: use case`)
  if (c.gift) assert.equal(intent.gift, true, `${c.text}: gift`)
  if (intent.budgetMax !== null)
    for (const p of rec.picks) assert.ok(Math.min(...p.variants.map((v) => v.price)) <= intent.budgetMax, `${c.text}: ${p.name} over budget`)
  process.stdout.write(
    `${c.text}\n  ${describeIntent(intent, c.catalog).join(' · ')}\n  picks: ${rec.picks.map((p) => p.name).join(', ') || `none, closest ${rec.closestCategory?.name}, cheapest ${rec.cheapest?.name}`}\n`,
  )
}
process.stdout.write('assistant-check: all assertions passed\n')
