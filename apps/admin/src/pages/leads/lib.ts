import { DAY, toMs } from '@rc/fixtures'
import type { Channel, Lead, LeadSource, LeadStage, Seller } from '@rc/types'
import { LEAD_STAGE_FLOW, OPEN_LEAD_STAGES } from '@rc/types'

/** Days without an update before an open lead counts as stale. */
export const STALE_DAYS = 7

export const BOARD_STAGES: LeadStage[] = [...LEAD_STAGE_FLOW, 'lost']

export const isOpen = (lead: Pick<Lead, 'stage'>) => OPEN_LEAD_STAGES.includes(lead.stage)

export function staleDays(lead: Lead, now: number): number | null {
  if (!isOpen(lead)) return null
  const days = Math.floor((now - toMs(lead.updatedAt)) / DAY)
  return days > STALE_DAYS ? days : null
}

/** The stage after the current one in the pipeline, or null once closed. */
export function nextLeadStage(lead: Pick<Lead, 'stage'>): LeadStage | null {
  if (!isOpen(lead)) return null
  return LEAD_STAGE_FLOW[LEAD_STAGE_FLOW.indexOf(lead.stage) + 1] ?? null
}

/** Seller profiles that belong to a console user (a sales agent can sell for several brands). */
export const sellerIdsOf = (sellers: readonly Seller[], userId: string) =>
  sellers.filter((s) => s.userId === userId).map((s) => s.id)

/** Channel a converted lead's customer record starts with. */
export const LEAD_SOURCE_CHANNEL: Record<LeadSource, Channel> = {
  talk_to_sales: 'web',
  personal_store: 'personal_store',
  whatsapp: 'whatsapp',
  event: 'pos',
  referral: 'web',
}
