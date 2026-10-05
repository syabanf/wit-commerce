/** The Commerce OS mark: a stacked storefront with an accent dot. Same shape as the favicon. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path
        d="M14 26h36l-3-10H17z"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d="M17 30v18h30V30"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="40" r="5" fill="var(--color-accent)" />
    </svg>
  )
}
