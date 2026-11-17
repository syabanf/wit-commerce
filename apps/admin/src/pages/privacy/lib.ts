import { ApiError } from '@rc/api'
import { HOUR, toMs } from '@rc/fixtures'
import type { PrivacyRequest } from '@rc/types'
import { toast } from '@rc/ui'
import { api } from '../../lib/api'

/** Overdue past the 3x24 hour deadline, due within a day, or with time to spare. */
export function deadlineTone(r: PrivacyRequest, now: number): 'danger' | 'warning' | 'default' {
  if (r.status !== 'open') return 'default'
  const left = toMs(r.dueAt) - now
  return left < 0 ? 'danger' : left < 24 * HOUR ? 'warning' : 'default'
}

/** Saves everything the store holds about a customer as a JSON file, for an access request. */
export async function downloadCustomerData(customerId: string, code: string) {
  try {
    const data = await api.privacy.export(customerId)
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${code}-data.json`
    link.click()
    URL.revokeObjectURL(url)
    toast('Customer data downloaded', { tone: 'success', description: `${code}-data.json` })
  } catch (err) {
    toast('The data did not download', {
      tone: 'danger',
      description: err instanceof ApiError ? err.message : 'The server did not answer. Try again.',
    })
  }
}
