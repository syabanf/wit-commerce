import type { StoreLanguage } from '@rc/types'
import { Fragment, type ReactNode, createElement, useSyncExternalStore } from 'react'
import { parseStored, readRaw, writeStored } from '../lib/storage'
import { type MessageKey, en } from './en'
import { id } from './id'

// Shopper-facing text in Bahasa Indonesia (the default, PP 80/2019 Pasal 55) or English. The store sets
// its language; a shopper's own pick in the footer wins and is remembered on this device. Text is read
// at render time, so a module-level constant must not hold translated text.

export type Lang = StoreLanguage
export type { MessageKey }
export type Vars = Record<string, string | number>

const DICTIONARIES: Record<Lang, Record<MessageKey, string>> = { id, en }
const CHOICE_KEY = 'rc.storefront.lang'

const isLang = (value: unknown): value is Lang => value === 'id' || value === 'en'

let storeDefault: Lang = 'id'
let choice: Lang | null = (() => {
  const stored = parseStored<unknown>(readRaw('local', CHOICE_KEY), null)
  return isLang(stored) ? stored : null
})()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

/** The language shoppers read now. */
export const currentLang = (): Lang => choice ?? storeDefault

/** The store's own language, used until the shopper picks one. */
export function setStoreLanguage(lang: Lang | undefined) {
  const next = lang ?? 'id'
  if (next === storeDefault) return
  storeDefault = next
  notify()
}

/** The shopper's pick from the footer switch, remembered on this device. */
export function chooseLanguage(lang: Lang) {
  choice = lang
  writeStored('local', CHOICE_KEY, lang)
  notify()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The current language; the component re-renders when it changes. */
export const useLang = () => useSyncExternalStore(subscribe, currentLang, currentLang)

/** The Intl locale for dates and numbers. */
export const locale = (lang: Lang = currentLang()) => (lang === 'id' ? 'id-ID' : 'en-GB')

const fill = (text: string, vars?: Vars) =>
  vars
    ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole))
    : text

/** One message in the current language, with `{name}` placeholders filled from `vars`. */
export function t(key: MessageKey, vars?: Vars): string {
  return fill(DICTIONARIES[currentLang()][key] ?? en[key], vars)
}

/** Keys that come in a `.one` and `.other` pair. */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}.one`
    ? `${Base}.other` extends MessageKey
      ? Base
      : never
    : never
}[MessageKey]

/** A count with its noun: `{count}` is filled in, formatted for the language. */
export function tp(key: PluralKey, count: number, vars?: Vars): string {
  const form = `${key}.${count === 1 ? 'one' : 'other'}` as MessageKey
  return t(form, { count: new Intl.NumberFormat(locale()).format(count), ...vars })
}

/**
 * A message with React nodes in its placeholders, such as a link inside a sentence:
 * `tx('checkout.agree', { terms: <Link>…</Link> })`. Returns the pieces to render in order, each keyed.
 */
export function tx(key: MessageKey, nodes: Record<string, ReactNode>, vars?: Vars): ReactNode[] {
  return fill(DICTIONARIES[currentLang()][key] ?? en[key], vars)
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((piece) => {
      const name = /^\{(\w+)\}$/.exec(piece)?.[1]
      return name && name in nodes ? nodes[name] : piece
    })
    .map((node, i) => createElement(Fragment, { key: i }, node))
}
