import * as account from './areas/account'
import * as agent from './areas/agent'
import * as catalog from './areas/catalog'
import * as checkout from './areas/checkout'
import * as common from './areas/common'
import * as shell from './areas/shell'
import * as theme from './areas/theme'
import type { MessageKey } from './en'

// Every area's Bahasa Indonesia text: the same keys as en.ts.
export const id: Record<MessageKey, string> = {
  ...common.id,
  ...shell.id,
  ...catalog.id,
  ...theme.id,
  ...checkout.id,
  ...account.id,
  ...agent.id,
}
