import * as account from './areas/account'
import * as agent from './areas/agent'
import * as catalog from './areas/catalog'
import * as checkout from './areas/checkout'
import * as common from './areas/common'
import * as payment from './areas/payment'
import * as refusal from './areas/refusal'
import * as shell from './areas/shell'
import * as theme from './areas/theme'

// Every area's English text. Each area file keeps its keys under its own prefix.
export const en = {
  ...common.en,
  ...shell.en,
  ...catalog.en,
  ...theme.en,
  ...checkout.en,
  ...account.en,
  ...agent.en,
  ...payment.en,
  ...refusal.en,
}

export type MessageKey = keyof typeof en
