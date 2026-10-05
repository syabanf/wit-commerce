import { fmtIdr } from '@rc/fixtures'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { CodeOfferStrip } from '../../components/promo'
import { HeartButton, PriceTag, ProductImage, Rating } from '../../components/product'
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
import { ProductGrid, ShowHeading } from './ProductCard'
import { BeautyFacts } from '../../components/beauty'

const SLIDES = [24, 12, 32, 18]

/** Full-bleed image slider with the vertical "01 / 04" indicator on phones; one large image from md, sticky from lg. */
function Gallery({ detail }: { detail: ProductDetail }) {
  const { store } = useShop()
  const [index, setIndex] = useState(0)
  const { product } = detail
  const back = detail.path.at(-1)
  return (
    <div className="-mx-4 -mt-4 md:mx-0 md:mt-0 lg:sticky lg:top-[var(--sf-sticky-top)] relative self-start">
      <div
        className="md:overflow-hidden no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        aria-label={`${product.name} pictures`}
        role="region"
      >
        {SLIDES.map((strength, i) => (
          <ProductImage
            key={strength}
            product={product}
            size="lg"
            strength={strength}
            className={`md:aspect-[4/3] md:max-h-[520px] md:rounded-[var(--sf-card-radius)] lg:aspect-[4/5] lg:max-h-[calc(100dvh_-_var(--sf-sticky-top)_-_2rem)] aspect-[4/5] w-full shrink-0 snap-start ${i > 0 ? 'md:hidden' : ''}`}
          />
        ))}
      </div>
      <div
        aria-hidden="true"
        className="left-3 gap-2 px-1.5 py-2 text-xs font-semibold md:hidden absolute top-1/2 flex -translate-y-1/2 flex-col items-center rounded-full bg-[var(--sf-bg)]/85"
      >
        <span>{String(index + 1).padStart(2, '0')}</span>
        <span className="h-12 w-px bg-[var(--sf-text)]" />
        <span className="opacity-60">{String(SLIDES.length).padStart(2, '0')}</span>
      </div>
      <Link
        to={back ? paths.category(store, back.id) : paths.home(store)}
        aria-label={back ? `Back to ${back.name}` : 'Back to the shop'}
        className="top-3 left-3 size-11 md:hidden absolute inline-flex items-center justify-center rounded-full bg-[var(--sf-bg)]"
      >
        <ArrowLeft className="size-5" aria-hidden="true" />
      </Link>
      <HeartButton product={product} className="top-3 right-3 md:top-4 md:right-4 absolute" />
      {detail.discountPct && (
        <Pill tone="dark" className="bottom-4 left-4 md:inline-flex absolute hidden">
          -{detail.discountPct}%
        </Pill>
      )}
    </div>
  )
}

export function Product({ detail }: { detail: ProductDetail }) {
  const { store } = useShop()
  const [added, setAdded] = useState<CartItem | null>(null)
  const { product } = detail
  const add = () => {
    const item = detail.add()
    if (item) setAdded(item)
  }
  return (
    <div>
      <div className="gap-6 lg:grid-cols-2 lg:gap-10 grid grid-cols-1">
        <Gallery detail={detail} />
        <div className="min-w-0 space-y-6">
          <div className="space-y-3">
            <h1 className="sf-display text-3xl leading-tight md:text-4xl md:font-extrabold xl:text-5xl break-words hyphens-none">
              {product.name}
            </h1>
            <Rating product={product} />
            {product.assisted ? (
              <p className="text-lg font-bold">Price on request</p>
            ) : (
              <PriceTag
                product={product}
                price={detail.variant?.price}
                className="flex"
                priceClassName="text-xl md:text-2xl"
              />
            )}
          </div>
          {!product.assisted && product.memberPrice && (
            <p className="text-sm text-[color:var(--sf-muted)]">Member price {fmtIdr(product.memberPrice)}</p>
          )}
          {!product.assisted && detail.codeOffer && <CodeOfferStrip {...detail.codeOffer} />}
          <p className="leading-relaxed text-[color:var(--sf-muted)]">{product.description}</p>
          <BeautyFacts product={product} />
          {product.assisted ? (
            <div className="pt-6 border-t border-[color:var(--sf-line)]">
              <h2 className="sf-display mb-4 text-lg font-semibold">Talk to sales</h2>
              <TalkToSalesForm product={product} />
            </div>
          ) : (
            <>
              <OptionPickers detail={detail} look="box" />
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
              <div className="inset-x-0 bottom-0 p-3 md:static md:border-0 md:bg-transparent md:p-0 fixed z-40 border-t border-[color:var(--sf-line)] bg-[var(--sf-bg)] pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                <Button variant="dark" size="lg" full disabled={!!detail.blocker} onClick={add}>
                  Add to cart · {fmtIdr(detail.lineTotal)}
                </Button>
              </div>
            </>
          )}
          <section aria-labelledby="best-h" className="py-4 border-y border-[color:var(--sf-line)]">
            <h2 id="best-h" className="sf-display text-lg font-semibold">
              Best for
            </h2>
            <p className="mt-1 text-sm text-[color:var(--sf-muted)]">{product.bestFor || 'Everyday use'}</p>
          </section>
          {detail.specs.length > 0 && (
            <section aria-labelledby="spec-h">
              <h2 id="spec-h" className="sf-display text-lg font-semibold">
                Specifications
              </h2>
              <SpecTable detail={detail} />
            </section>
          )}
        </div>
      </div>
      {detail.related.length > 0 && (
        <section aria-labelledby="related-h" className="mt-14">
          <ShowHeading
            id="related-h"
            title="You may also like"
            action={
              detail.path.length
                ? { label: 'Explore all', to: paths.category(store, detail.path.at(-1)!.id) }
                : undefined
            }
          />
          <ProductGrid products={detail.related} rail />
        </section>
      )}
      <AddedDrawer item={added} onClose={() => setAdded(null)} />
    </div>
  )
}
