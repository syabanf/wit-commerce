import { LEGAL_RETURN_WORKING_DAYS, returnWindowDays } from '@rc/fixtures'
import type { Tenant } from '@rc/types'
import { t } from '../i18n'

/**
 * The return rule footers, FAQs and the benefits strip state, from the brand's return window and the
 * PP 80/2019 Pasal 69(1) floor, so no page promises a window the store does not keep.
 */
export function returnsPolicy(tenant: Pick<Tenant, 'returnWindowDays'>) {
  const days = returnWindowDays(tenant)
  const legal = LEGAL_RETURN_WORKING_DAYS
  return {
    /** One sentence for footers and FAQs. */
    sentence:
      days > 0 ? t('account.policy.window', { days, legal }) : t('account.policy.byMessage', { legal }),
    /** A short title and line for the benefits strip. */
    title: days > 0 ? t('catalog.benefit.returnsDays', { days }) : t('catalog.benefit.returnsLegal'),
    text: t('catalog.benefit.returnsFloor', { legal }),
  }
}
