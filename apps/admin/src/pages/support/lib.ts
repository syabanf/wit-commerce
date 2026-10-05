import { MINUTE, fmtAgo, fmtDuration, toMs } from '@rc/fixtures'
import type { Ticket, TicketStatus } from '@rc/types'

export const TICKET_CHANNEL_LABEL: Record<Ticket['channel'], string> = {
  whatsapp: 'WhatsApp',
  chat: 'Live chat',
  email: 'Email',
}

export const VIEWS: TicketStatus[] = ['open', 'pending', 'resolved']

export const isLate = (t: Ticket, now: number) => t.status !== 'resolved' && toMs(t.slaDueAt) < now

/** "Late 3h", "Due in 5h" or "Resolved 2d ago". */
export function slaText(t: Ticket, now: number): string {
  if (t.status === 'resolved') return t.resolvedAt ? `Resolved ${fmtAgo(t.resolvedAt, now)}` : 'Resolved'
  const due = toMs(t.slaDueAt)
  return due < now ? `Late ${fmtDuration((now - due) / MINUTE)}` : `Due ${fmtAgo(due, now)}`
}
