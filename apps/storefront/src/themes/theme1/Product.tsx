import { fmtIdr } from '@rc/fixtures'
import { cn } from '@rc/ui'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { CodeOfferStrip } from '../../components/promo'
import { HeartButton, PriceTag, ProductImage, Rating, swatchColour } from '../../components/product'
import {
  AddedDrawer,
  ModifierGroups,
  OptionPickers,
  SpecTable,
  StockLine,
} from '../../components/productParts'
import { TalkToSalesForm } from '../../components/TalkToSales'
import { Button, Pill, QtyStepper } from '../../components/ui'
import type { ProductDetail } from '../../features/product'
import type { CartItem } from '../../lib/cart'
import { paths } from '../../lib/paths'
import { useShop } from '../../state/shop'
import { ProductsBlock } from './blocks'
import { Crumbs } from './Listing'
import { BeautyFacts } from '../../components/beauty'

/** Colour dots above the title on phones; the real picker sits below. */
function ColourDots({ detail }: { detail: ProductDetail }) {
  const colour = detail.options.find((o) => o.kind === 'colour')
  if (!colour) return null
  return (
    <div aria-hidden="true" className="gap-1.5 md:hidden flex">
      {colour.values.map((v) => (
        <span
          key={v.value}
          className={cn(
            'size-4 rounded-full border border-[color:var(--sf-line)]',
            v.selected && 'ring-2 ring-[color:var(--sf-text)] ring-offset-2',
          )}
          style={{ background: swatchColour(v.value) ?? 'var(--sf-soft)' }}
        />
      ))}
    </div>
  )
}

export function Product({ detail }: { detail: ProductDetail }) {
  const { store } = useShop()
  const navigate = useNavigate()
  const [added, setAdded] = useState<CartItem | null>(null)
  const { product } = detail
  const add = () => {
    const item = detail.add()
    if (item) setAdded(item)
  }
  const buyNow = () => {
    if (detail.add()) navigate(paths.cart(store))
  }
  return (
    <div>
      <Crumbs
        crumbs={[
          { label: 'Home', to: paths.home(store) },
          ...detail.path.map((c) => ({ label: c.name, to: paths.category(store, c.id) })),
        ]}
      />
      <div className="gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8 grid grid-cols-1 items-start">
        <div className="lg:sticky lg:top-[var(--sf-sticky-top)] relative">
          <ProductImage
            product={product}
            size="lg"
            strength={24}
            className="md:aspect-[4/3] md:max-h-[520px] lg:aspect-[4/5] lg:max-h-[calc(100dvh_-_var(--sf-sticky-top)_-_2rem)] aspect-square max-h-[480px] w-full rounded-[var(--sf-card-radius)]"
          />
          {detail.discountPct && (
            <Pill tone="accent" className="top-4 left-4 text-sm absolute">
              -{detail.discountPct}%
            </Pill>
          )}
          <HeartButton product={product} className="top-4 right-4 absolute" />
        </div>
        <div className="sf-card min-w-0 space-y-5 p-5 md:p-8">
          <ColourDots detail={detail} />
          <div>
            <h1 className="sf-display text-3xl leading-tight font-bold md:text-4xl break-words hyphens-none">
              {product.name}
            </h1>
            <Rating product={product} className="mt-2" />
          </div>
          {product.assisted ? (
            <p className="text-lg font-bold text-[color:var(--sf-primary)]">Price on request</p>
          ) : (
            <div className="space-y-1">
              <PriceTag product={product} price={detail.variant?.price} priceClassName="text-3xl" />
              {product.memberPrice && (
                <p className="text-sm text-[color:var(--sf-muted)]">
                  Member price {fmtIdr(product.memberPrice)}
                </p>
              )}
              {detail.codeOffer && <CodeOfferStrip {...detail.codeOffer} />}
            </div>
          )}
          {product.assisted ? (
            <div className="pt-5 border-t border-[color:var(--sf-line)]">
              <h2 className="sf-display mb-1 text-xl font-bold">Talk to sales</h2>
              <p className="mb-4 text-sm text-[color:var(--sf-muted)]">
                Get a quote sized to your line, with delivery and installation.
              </p>
              <TalkToSalesForm product={product} />
            </div>
          ) : (
            <>
              <OptionPickers detail={detail} />
              <ModifierGroups detail={detail} />
              <div className="gap-4 flex flex-wrap items-center">
                <QtyStepper value={detail.qty} onChange={detail.setQty} max={detail.maxQty} />
                <StockLine detail={detail} />
              </div>
              {detail.blocker && (
                <p role="status" className="text-sm font-semibold text-danger">
                  {detail.blocker}
                </p>
              )}
              <div className="gap-2 md:grid lg:flex hidden grid-cols-1">
                <Button size="lg" className="lg:flex-1" disabled={!!detail.blocker} onClick={add}>
                  Add to cart · {fmtIdr(detail.lineTotal)}
                </Button>
                <Button size="lg" variant="dark" disabled={!!detail.blocker} onClick={buyNow}>
                  Buy now
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 gap-4 md:grid-cols-2 lg:grid-cols-3 grid grid-cols-1 items-stretch">
        <section className="sf-card p-6" aria-labelledby="love-h">
          <h2 id="love-h" className="sf-display text-xl font-bold">
            Why you'll love it
          </h2>
          <p className="mt-2 leading-relaxed text-[color:var(--sf-muted)]">{product.description}</p>
          <div className="mt-4">
            <BeautyFacts product={product} />
          </div>
          {product.tags.length > 0 && (
            <ul className="mt-4 gap-2 flex flex-wrap">
              {product.tags.map((t) => (
                <li key={t}>
                  <Link
                    to={paths.search(store, t)}
                    className="min-h-9 px-3 text-xs font-semibold inline-flex items-center rounded-full bg-[var(--sf-soft)] hover:underline"
                  >
                    {t}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="sf-card p-6" aria-labelledby="best-h">
          <h2 id="best-h" className="sf-display text-xl font-bold">
            Best for
          </h2>
          <p className="mt-2 text-lg font-semibold">{product.bestFor || 'Everyday use'}</p>
        </section>
        <section className="sf-card p-6 md:col-span-2 lg:col-span-1" aria-labelledby="spec-h">
          <h2 id="spec-h" className="sf-display text-xl font-bold">
            Specifications
          </h2>
          {detail.specs.length ? (
            <SpecTable detail={detail} className="mt-2" />
          ) : (
            <p className="mt-2 text-sm text-[color:var(--sf-muted)]">
              No specifications listed for this product.
            </p>
          )}
        </section>
      </div>

      <div className="mt-8">
        <ProductsBlock
          id="related-h"
          title={detail.path.length ? `More in ${detail.path.at(-1)!.name}` : 'You may also like'}
          products={detail.related}
        />
      </div>

      {!product.assisted && (
        <div className="inset-x-0 bottom-0 p-3 md:hidden fixed z-40 border-t border-[color:var(--sf-line)] bg-[var(--sf-bg)] pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          {detail.blocker && (
            <p className="mb-2 text-xs font-semibold text-center text-danger">{detail.blocker}</p>
          )}
          <Button variant="dark" size="lg" full disabled={!!detail.blocker} onClick={buyNow}>
            Buy for {fmtIdr(detail.lineTotal)}
          </Button>
        </div>
      )}
      <AddedDrawer item={added} onClose={() => setAdded(null)} />
    </div>
  )
}
