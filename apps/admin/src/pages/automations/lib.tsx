import type { Automation, AutomationStepKind } from '@rc/types'
import type { Tone } from '@rc/ui'
import { BellRing, Clock, Coins, GitBranch, Headset, Mail, MessageCircle, Tag, Ticket } from 'lucide-react'
import type { ReactNode } from 'react'

export const STEP_KINDS: AutomationStepKind[] = [
  'wait',
  'condition',
  'send_email',
  'send_whatsapp',
  'push',
  'give_voucher',
  'add_points',
  'add_tag',
  'notify_sales',
]

/** Icon and tile tone per step: messages in info, rewards in success, the branch in warning, waits neutral. */
export const STEP_LOOK: Record<AutomationStepKind, { icon: ReactNode; tone: Tone; placeholder: string }> = {
  wait: { icon: <Clock />, tone: 'default', placeholder: '3 days' },
  condition: { icon: <GitBranch />, tone: 'warning', placeholder: 'Has no order yet' },
  send_email: { icon: <Mail />, tone: 'info', placeholder: 'Welcome to the club' },
  send_whatsapp: { icon: <MessageCircle />, tone: 'info', placeholder: 'Voucher reminder' },
  push: { icon: <BellRing />, tone: 'info', placeholder: 'Your cart is waiting' },
  give_voucher: { icon: <Ticket />, tone: 'success', placeholder: 'WELCOME10, valid 14 days' },
  add_points: { icon: <Coins />, tone: 'success', placeholder: '200 points' },
  add_tag: { icon: <Tag />, tone: 'default', placeholder: 'welcome-done' },
  notify_sales: { icon: <Headset />, tone: 'ink', placeholder: 'Assigned seller follows up by WhatsApp' },
}

export const conversion = (a: Pick<Automation, 'enrolled30d' | 'converted30d'>) =>
  a.enrolled30d ? a.converted30d / a.enrolled30d : 0
