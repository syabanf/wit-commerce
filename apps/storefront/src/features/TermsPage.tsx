import { Printer } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '../components/ui'
import { couriersFor } from '../lib/checkout'
import { paths } from '../lib/paths'
import { buildTerms } from '../lib/terms'
import { useTitle } from '../lib/useTitle'
import { useShop } from '../state/shop'

/** Syarat & Ketentuan, generated from the brand's legal details, in Bahasa Indonesia (Pasal 55). */
export function TermsPage() {
  const { tenant, catalog, store } = useShop()
  useTitle(`Syarat & Ketentuan · ${tenant.name}`)
  const terms = buildTerms(tenant, catalog.paymentTypes, couriersFor(tenant))
  const pagePath = { help: paths.help(store), privacy: paths.privacy(store) }
  return (
    <article lang="id" className="sf-card max-w-3xl p-6 md:p-10 mx-auto" aria-labelledby="terms-h">
      <div className="gap-3 flex flex-wrap items-start justify-between">
        <div className="min-w-0">
          <h1 id="terms-h" className="sf-display text-3xl font-bold">
            Syarat &amp; Ketentuan
          </h1>
          <p className="mt-1 text-sm text-[color:var(--sf-muted)]">
            {tenant.name} · Versi <span className="font-mono">{terms.version}</span>
          </p>
        </div>
        {/* Pasal 56: shoppers can keep a copy of the contract. */}
        <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
          <Printer aria-hidden="true" /> Simpan atau cetak
        </Button>
      </div>
      <div className="mt-6 space-y-6">
        {terms.sections.map((section) => (
          <section key={section.id} aria-labelledby={`terms-${section.id}`}>
            <h2 id={`terms-${section.id}`} className="sf-display text-lg font-bold">
              {section.title}
            </h2>
            <div className="mt-2 space-y-2 text-sm leading-relaxed">
              {section.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
              {section.link && (
                <p>
                  <Link
                    to={pagePath[section.link.page]}
                    className="font-semibold underline underline-offset-4"
                  >
                    {section.link.label}
                  </Link>
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </article>
  )
}
