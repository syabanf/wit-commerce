import { fmtIdr, fmtNumber, fmtPercent, sellerPerformance, sellerTemplateBlocker } from '@rc/fixtures'
import type { Product, Template } from '@rc/types'
import { PAGE_STATUS_LABEL } from '@rc/types'
import { Banner, Button, Card, cn, toast } from '@rc/ui'
import { Check, ExternalLink, Lock, Share2 } from 'lucide-react'
import { useState } from 'react'
import { Section, sectionLinkClass } from '../../components/Section'
import { StorePreview } from '../../components/StorePreview'
import { ScreenHeader } from '../../layouts/ScreenHeader'
import { shareLink } from '../../lib/seller'
import { useNow, useSellerScope } from '../../state/scope'
import { FeaturedSheet, MAX_FEATURED } from './FeaturedSheet'

export function StorePage() {
  const { seller, tenant, page, templates, maps, storeUrl, storeHref, orders, traffic, leads, dispatch } =
    useSellerScope()
  const now = useNow()
  const [editingFeatured, setEditingFeatured] = useState(false)
  const template = maps.template.get(seller.templateId)
  const featured = seller.featuredProductIds
    .map((id) => maps.product.get(id))
    .filter((p): p is Product => !!p)
  const stats = sellerPerformance([seller], orders, traffic, leads, 30, now).get(seller.id)!
  const layoutLocked = tenant.brand.locks.layout
  const featuredLocked = tenant.brand.locks.featured_product
  const allowed = templates.filter((t) => seller.allowedTemplateIds.includes(t.id))
  const others = templates.filter((t) => !seller.allowedTemplateIds.includes(t.id))

  const choose = (t: Template) => {
    if (t.id === seller.templateId) return
    const blocker = sellerTemplateBlocker(seller, t.id)
    if (blocker) {
      toast('Template not changed', { tone: 'danger', description: blocker })
      return
    }
    dispatch({ type: 'sellers/setTemplate', id: seller.id, templateId: t.id })
    toast(`Template changed to ${t.name}`, {
      tone: 'success',
      description: 'Your bio, products and CTA stayed the same.',
    })
  }

  return (
    <div className="space-y-6">
      <ScreenHeader context={storeUrl} title="My store" />

      {!page ? (
        <Banner tone="warning" title="Your page is not set up yet">
          Ask your admin to create your personal page. The preview shows how it will look.
        </Banner>
      ) : (
        page.status !== 'published' && (
          <Banner tone="warning" title={`Your page is ${PAGE_STATUS_LABEL[page.status].toLowerCase()}`}>
            Shoppers see it once your admin publishes it.
          </Banner>
        )
      )}

      <StorePreview
        tenant={tenant}
        seller={seller}
        page={page}
        template={template}
        products={featured}
        storeUrl={storeUrl}
      />

      <div className="gap-2 grid grid-cols-2">
        <Button
          variant="card"
          size="lg"
          onClick={() => shareLink(storeHref, `${seller.name} · ${tenant.name}`)}
        >
          <Share2 />
          Share
        </Button>
        <Button asChild variant="card" size="lg">
          <a href={storeHref} target="_blank" rel="noreferrer">
            <ExternalLink />
            Open store
          </a>
        </Button>
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold">Last 30 days</h2>
        <dl className="mt-3 gap-3 grid grid-cols-3">
          {[
            { label: 'Page views', value: fmtNumber(stats.pageViews) },
            { label: 'Visitors', value: fmtNumber(stats.visitors) },
            { label: 'Conversion', value: fmtPercent(stats.conversion, 1) },
          ].map((s) => (
            <div key={s.label}>
              <dt className="text-xs text-muted">{s.label}</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">
          {fmtNumber(stats.orders)} orders from {fmtNumber(stats.visitors)} visitors.
        </p>
      </Card>

      <Section title="Template">
        {layoutLocked && (
          <p className="gap-1.5 text-xs font-medium flex items-center text-muted">
            <Lock aria-hidden="true" className="size-3.5" />
            Your brand team locked the page layout.
          </p>
        )}
        <div className="space-y-2">
          {allowed.map((t) => {
            const current = t.id === seller.templateId
            return (
              <TemplateRow
                key={t.id}
                template={t}
                current={current}
                disabled={layoutLocked && !current}
                onChoose={() => choose(t)}
              />
            )
          })}
          {others.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              current={false}
              disabled
              hint="Ask your admin to allow it"
              onChoose={() => undefined}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Featured products"
        count={featured.length}
        action={
          featuredLocked ? undefined : (
            <button type="button" className={sectionLinkClass} onClick={() => setEditingFeatured(true)}>
              Edit
            </button>
          )
        }
      >
        {featuredLocked && (
          <p className="text-xs font-medium text-muted">Your brand team picks the featured products.</p>
        )}
        {featured.length ? (
          <ol className="px-4 divide-y divide-border rounded-[24px] bg-card shadow-card">
            {featured.map((p, i) => (
              <li key={p.id} className="min-h-14 gap-3 py-3 flex items-center">
                <span className="size-8 text-xs font-bold flex shrink-0 items-center justify-center rounded-full bg-surface tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0 text-sm font-semibold flex-1 truncate">{p.name}</span>
                <span className="text-sm shrink-0 text-muted tabular-nums">
                  {p.assisted ? 'Talk to sales' : fmtIdr(p.price)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">
            None picked yet. Up to {MAX_FEATURED} products show on your store.
          </p>
        )}
      </Section>

      <FeaturedSheet open={editingFeatured} onOpenChange={setEditingFeatured} />
    </div>
  )
}

function TemplateRow({
  template,
  current,
  disabled,
  hint,
  onChoose,
}: {
  template: Template
  current: boolean
  disabled: boolean
  hint?: string
  onChoose: () => void
}) {
  return (
    <button
      type="button"
      aria-current={current || undefined}
      disabled={disabled}
      onClick={onChoose}
      className={cn(
        'min-h-14 gap-3 rounded-2xl px-4 py-3 flex w-full items-center text-left transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none active:scale-[0.99] disabled:cursor-not-allowed',
        current ? 'bg-ink text-on-ink shadow-float' : 'bg-card shadow-card hover:bg-surface-2',
        disabled && !current && 'opacity-60 shadow-none',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="text-sm font-semibold block truncate">{template.name}</span>
        <span className={cn('text-xs block truncate', current ? 'text-on-ink-muted' : 'text-muted')}>
          {hint ?? template.bestFor}
        </span>
      </span>
      {current ? (
        <Check aria-hidden="true" className="size-5 shrink-0" />
      ) : (
        disabled && hint && <Lock aria-hidden="true" className="size-4 shrink-0 text-muted" />
      )}
    </button>
  )
}
