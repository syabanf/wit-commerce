import type { Industry } from '@rc/types'
import { t } from '../i18n'

/**
 * The returns rule each industry's stores state in footers, FAQs and the benefits strip. Each entry is
 * a getter, so it reads the shopper's language when a page renders it.
 */
export const RETURNS_POLICY: Record<Industry, string> = {
  get sport() {
    return t('account.policy.sport')
  },
  get fashion() {
    return t('account.policy.fashion')
  },
  get beauty() {
    return t('account.policy.beauty')
  },
  get electronics() {
    return t('account.policy.electronics')
  },
  get industrial() {
    return t('account.policy.industrial')
  },
  get fnb() {
    return t('account.policy.fnb')
  },
}
