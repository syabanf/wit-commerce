import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as account from '../src/i18n/areas/account'
import * as agent from '../src/i18n/areas/agent'
import * as catalog from '../src/i18n/areas/catalog'
import * as checkout from '../src/i18n/areas/checkout'
import * as common from '../src/i18n/areas/common'
import * as payment from '../src/i18n/areas/payment'
import * as refusal from '../src/i18n/areas/refusal'
import * as shell from '../src/i18n/areas/shell'
import * as theme from '../src/i18n/areas/theme'
import { en } from '../src/i18n/en'
import { id } from '../src/i18n/id'
import { chooseLanguage, currentLang, setStoreLanguage, t, tp } from '../src/i18n'
import { etaLabel, fmtDate } from '../src/i18n/format'

const areas = { account, agent, catalog, checkout, common, payment, refusal, shell, theme }
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

test('both dictionaries have the same keys, none empty', () => {
  assert.deepEqual(Object.keys(id).sort(), Object.keys(en).sort())
  for (const [key, text] of Object.entries(id)) assert.ok(text.trim(), `id ${key} is empty`)
  for (const [key, text] of Object.entries(en)) assert.ok(text.trim(), `en ${key} is empty`)
})

test('each area keeps its keys under its own prefix, so no area overwrites another', () => {
  let total = 0
  for (const [name, area] of Object.entries(areas)) {
    assert.deepEqual(Object.keys(area.id).sort(), Object.keys(area.en).sort(), `${name} differs`)
    total += Object.keys(area.en).length
    if (name === 'common') continue
    for (const key of Object.keys(area.en)) assert.ok(key.startsWith(`${name}.`), `${key} is outside ${name}`)
  }
  assert.equal(Object.keys(en).length, total)
})

test('a translation fills the same placeholders as its English', () => {
  for (const key of Object.keys(en) as (keyof typeof en)[])
    assert.deepEqual(placeholders(id[key]), placeholders(en[key]), key)
})

test('Bahasa Indonesia is the default; the store and then the shopper can change it', () => {
  assert.equal(currentLang(), 'id')
  assert.equal(t('format.eta.range', { min: 2, max: 3 }), '2 sampai 3 hari')
  assert.equal(fmtDate('2026-08-22T03:00:00.000Z'), '22 Agu 2026')
  setStoreLanguage('en')
  assert.equal(t('format.eta.range', { min: 2, max: 3 }), '2 to 3 days')
  assert.equal(fmtDate('2026-08-22T03:00:00.000Z'), '22 Aug 2026')
  chooseLanguage('id')
  assert.equal(etaLabel({ min: 0, max: 0 }), 'Hari yang sama')
  setStoreLanguage(undefined)
  chooseLanguage('en')
  assert.equal(currentLang(), 'en')
})

test('plurals pick the form and format the count', () => {
  chooseLanguage('en')
  const key = Object.keys(en)
    .find((k) => k.endsWith('.one'))!
    .slice(0, -'.one'.length) as Parameters<typeof tp>[0]
  assert.match(tp(key, 1), /1/)
  assert.match(tp(key, 1200), /1,200/)
  chooseLanguage('id')
  assert.match(tp(key, 1200), /1\.200/)
})

test('a name that ends in a full stop, ! or ? never doubles the full stop after it', () => {
  for (const lang of ['id', 'en'] as const) {
    chooseLanguage(lang)
    for (const store of ['Lari Running Co.', 'Yay!', 'Why?']) {
      for (const text of [
        t('agent.ask.greeting', { store }),
        t('agent.thread.greeting', { name: 'Rina', store }),
        t('agent.thread.greetingGuest', { store, next: 'Go.' }),
      ]) {
        assert.ok(text.includes(store), text)
        assert.doesNotMatch(text, /[.!?]\./, text)
      }
    }
  }
  chooseLanguage('id')
  assert.equal(
    t('agent.ask.greeting', { store: 'Lari Running Co.' }),
    'Halo, saya asisten Lari Running Co. Ceritakan apa yang Anda cari, atau pilih di bawah.',
  )
  assert.equal(t('shell.greeting.welcomeBack', { name: 'Rina' }), 'Selamat datang kembali, Rina.')
  chooseLanguage('en')
})
