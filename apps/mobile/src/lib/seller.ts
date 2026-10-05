import { DAY, fmtPercent, startOfDay, startOfMonth, toMs, wib } from '@rc/fixtures'
import type { Lead, LeadStage } from '@rc/types'
import { LEAD_STAGE_FLOW, OPEN_LEAD_STAGES } from '@rc/types'
import { toast } from '@rc/ui'

/** A lead nobody touched for this long shows as stale. */
export const STALE_DAYS = 7

export const isOpenLead = (lead: Lead) => OPEN_LEAD_STAGES.includes(lead.stage)

/** The next stage of an open lead, or null once it is won or lost. */
export function nextLeadStage(lead: Lead): LeadStage | null {
  if (!isOpenLead(lead)) return null
  return LEAD_STAGE_FLOW[LEAD_STAGE_FLOW.indexOf(lead.stage) + 1] ?? null
}

export const daysSince = (iso: string, now: number) => Math.floor((now - toMs(iso)) / DAY)

export const isStale = (lead: Lead, now: number) =>
  isOpenLead(lead) && daysSince(lead.updatedAt, now) > STALE_DAYS

/** Days from the first of this month through today, for month-to-date figures. */
export const monthToDateDays = (now: number) => Math.round((startOfDay(now) - startOfMonth(now)) / DAY) + 1

export function greeting(now: number) {
  const { hours } = wib(now)
  if (hours < 12) return 'Good morning'
  if (hours < 17) return 'Good afternoon'
  return 'Good evening'
}

export const firstName = (name: string) => name.split(/\s+/)[0] ?? name

/** Digits only, the form wa.me and tel: links expect. */
const digits = (phone: string) => phone.replace(/\D/g, '')

export const telLink = (phone: string) => `tel:+${digits(phone)}`

export const waLink = (phone: string, text?: string) =>
  `https://wa.me/${digits(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`

/** Opens the phone's share sheet, or copies the link where the browser has none. */
export async function shareLink(url: string, title: string) {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url })
      toast('Store link shared', { tone: 'success', description: url })
    } catch (error) {
      // Closing the share sheet is a choice, not a failure.
      if ((error as DOMException).name !== 'AbortError')
        toast('Sharing failed', {
          tone: 'danger',
          description: 'Copy the link from your store page instead.',
        })
    }
    return
  }
  try {
    await navigator.clipboard.writeText(url)
    toast('Store link copied', { tone: 'success', description: url })
  } catch {
    toast('Copying failed', {
      tone: 'danger',
      description: `Your browser blocked the clipboard. The link is ${url}`,
    })
  }
}

/** 0.05 → "5%", 0.015 → "1.5%". */
export const fmtRate = (rate: number) => fmtPercent(rate, Math.round(rate * 1000) % 10 ? 1 : 0)
