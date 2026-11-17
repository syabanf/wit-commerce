import { Link } from 'react-router'
import { paths } from '../lib/paths'
import { useShop } from '../state/shop'

/** Shown when a shopper places an order without ticking the consent box. */
export const TERMS_REQUIRED = 'Agree to the Terms and the Privacy Policy to place your order.'

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
        I agree to the{' '}
        <Link to={paths.terms(store)} target="_blank" className="font-semibold underline underline-offset-4">
          Terms
        </Link>{' '}
        and the{' '}
        <Link
          to={paths.privacy(store)}
          target="_blank"
          className="font-semibold underline underline-offset-4"
        >
          Privacy Policy
        </Link>
        .
      </span>
    </label>
  )
}

/** The buying agent asks before it pays, so approving is the shopper's consent; this line says so. */
export function ApproveMeansConsent() {
  const { store } = useShop()
  return (
    <p className="mt-2 text-xs">
      Approving means you agree to the{' '}
      <Link to={paths.terms(store)} target="_blank" className="font-semibold underline underline-offset-4">
        Terms
      </Link>{' '}
      and the{' '}
      <Link to={paths.privacy(store)} target="_blank" className="font-semibold underline underline-offset-4">
        Privacy Policy
      </Link>
      .
    </p>
  )
}
