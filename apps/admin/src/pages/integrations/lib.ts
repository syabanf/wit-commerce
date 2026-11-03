import type { IntegrationCategory } from '@rc/types'
import { toast } from '@rc/ui'

export const CATEGORY_ORDER: IntegrationCategory[] = [
  'payment',
  'logistics',
  'enterprise',
  'marketing',
  'marketplace',
]

/** Sync is a request to the provider; the demo resolves it after this delay. */
export const SYNC_DELAY_MS = 600

/** Where connected systems call: the API this console talks to, as an absolute address. */
export const apiBaseUrl = (configured: string | null) =>
  new URL(`${configured ?? '/api'}/v1`, window.location.origin).href

export async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast(`Copied ${what}`)
  } catch {
    toast(`Could not copy ${what}`, { tone: 'danger', description: 'Select the text and copy it by hand.' })
  }
}
