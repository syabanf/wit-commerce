import { Link } from 'react-router'
import { paths } from '../lib/paths'
import { useShop } from '../state/shop'
import { t, tx } from '../i18n'

/** Shown when a shopper places an order without ticking the consent box. */
export const termsRequired = () => t('checkout.terms.required')

/**
 * The checkout's required consent (PP 80/2019 Pasal 46). The API refuses a shopper order that does
 * not carry the version of the terms the store shows now.
 */
export function TermsConsent({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const { store } = useShop()
  return (
    <label className="gap-3 text-sm flex items-start">
      <input
        type="checkbox"
        required
        className="size-5 mt-0.5 shrink-0 accent-[var(--sf-primary)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {tx('checkout.terms.agree', {
          terms: (
            <Link key="terms" to={paths.terms(store)} target="_blank" className="font-semibold underline underline-offset-4">
              {t('checkout.terms.terms')}
            </Link>
          ),
          privacy: (
            <Link
              key="privacy"
              to={paths.privacy(store)}
              target="_blank"
              className="font-semibold underline underline-offset-4"
            >
              {t('checkout.terms.privacy')}
            </Link>
          ),
        })}
      </span>
    </label>
  )
}

/** The buying agent asks before it pays, so approving is the shopper's consent; this line says so. */
export function ApproveMeansConsent() {
  const { store } = useShop()
  return (
    <p className="mt-2 text-xs">
      {tx('checkout.terms.approving', {
        terms: (
          <Link key="terms" to={paths.terms(store)} target="_blank" className="font-semibold underline underline-offset-4">
            {t('checkout.terms.terms')}
          </Link>
        ),
        privacy: (
          <Link key="privacy" to={paths.privacy(store)} target="_blank" className="font-semibold underline underline-offset-4">
            {t('checkout.terms.privacy')}
          </Link>
        ),
      })}
    </p>
  )
}
