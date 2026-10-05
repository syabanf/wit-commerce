import type { Industry } from '@rc/types'

/** The returns rule each industry's stores state in footers, FAQs and the benefits strip. */
export const RETURNS_POLICY: Record<Industry, string> = {
  sport: 'Returns within 14 days of delivery, unused and in the original box.',
  fashion: 'Returns within 14 days of delivery, unworn with the tags on.',
  beauty: 'Unopened products return within 14 days of delivery.',
  electronics: 'Returns within 7 days of delivery, sealed in the original box.',
  industrial: 'Parts return under the warranty terms in your quote.',
  fnb: 'Damaged or wrong items replaced if you tell us within 2 days.',
}
