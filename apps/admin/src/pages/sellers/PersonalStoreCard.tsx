import { sellerTemplateBlocker } from '@rc/fixtures'
import { DEVICE_LABEL, PAGE_STATUS_LABEL, type Device, type Seller } from '@rc/types'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Kicker,
  PillTabs,
  cn,
  toast,
} from '@rc/ui'
import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/auth'
import { StorefrontPreview } from '../../components/StorefrontPreview'
import { LiveStorefront } from '../../components/LiveStorefront'
import { paths } from '../../components/links'
import { useScoped } from '../../state/scoped'
import { storeUrl } from './lib'

const DEVICES: Device[] = ['desktop', 'mobile']
const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x))

/**
 * The seller's storefront: the templates the tenant allows, the one in use, and a live preview.
 * Switching template keeps the content (bio, featured products, CTA) and changes only the layout.
 * Mount it with `key={seller.id}` so the allowed-templates draft resets per seller.
 */
export function PersonalStoreCard({ seller }: { seller: Seller }) {
  const s = useScoped()
  const { can } = useAuth()
  const canAdmin = can('seller.manage')
  const canApply = canAdmin || (seller.userId !== null && seller.userId === s.user.id)
  const [device, setDevice] = useState<Device>('desktop')
  const [allowed, setAllowed] = useState(seller.allowedTemplateIds)
  const dirty = !sameSet(allowed, seller.allowedTemplateIds)

  const personal = s.templates.filter((t) => t.scope === 'personal')
  const current = s.maps.template.get(seller.templateId)
  const page = s.pages.find((p) => p.sellerId === seller.id)
  const sections = page?.sections ?? []

  const toggleAllowed = (id: string) =>
    setAllowed((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  const saveAllowed = () => {
    s.dispatch({ type: 'sellers/save', seller: { ...seller, allowedTemplateIds: allowed } })
    toast('Allowed templates saved', {
      tone: 'success',
      description: `${seller.name} can now choose from ${allowed.length} ${allowed.length === 1 ? 'template' : 'templates'}.`,
    })
  }

  const apply = (templateId: string, name: string) => {
    s.dispatch({ type: 'sellers/setTemplate', id: seller.id, templateId })
    toast('Template changed. Bio, products and CTA stayed the same.', {
      tone: 'success',
      description: `${seller.name} · ${name}`,
    })
  }

  const simplePreview = (
    <div className="mt-2 rounded-2xl p-3 max-h-[40rem] overflow-auto bg-surface-2">
      <div className={cn('mx-auto w-full', device === 'mobile' && 'max-w-[375px]')}>
        <StorefrontPreview
          brand={s.tenant.brand}
          storeName={s.tenant.name}
          sections={sections}
          device={device}
          products={s.maps.product}
          seller={seller}
        />
      </div>
    </div>
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal store</CardTitle>
        <CardDescription>
          The seller writes the content once. The template only decides the layout and which sections show, so
          switching keeps their bio, products and CTA.
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] grid grid-cols-1">
        <div className="min-w-0">
          <Kicker>Templates</Kicker>
          <ul className="mt-2 space-y-2">
            {personal.map((t) => {
              const isCurrent = t.id === seller.templateId
              const isAllowed = seller.allowedTemplateIds.includes(t.id)
              const blocker = sellerTemplateBlocker(seller, t.id)
              return (
                <li key={t.id} className={cn('rounded-2xl p-3 bg-surface-2', isCurrent && 'ring-2 ring-ink')}>
                  <div className="gap-2 flex flex-wrap items-start justify-between">
                    <div className="min-w-0 basis-48 gap-2.5 flex flex-1 items-start">
                      {canAdmin && (
                        <input
                          type="checkbox"
                          aria-label={`Allow ${t.name}`}
                          className="mt-1 size-4 shrink-0 accent-ink disabled:opacity-50"
                          checked={allowed.includes(t.id)}
                          disabled={isCurrent}
                          title={
                            isCurrent
                              ? 'The template in use stays allowed. Apply another one first.'
                              : undefined
                          }
                          onChange={() => toggleAllowed(t.id)}
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{t.name}</p>
                        <p className="text-xs text-muted">{t.description}</p>
                        <p className="mt-1 text-[0.6875rem] text-muted">
                          {t.sections.length} sections · best for {t.bestFor}
                        </p>
                      </div>
                    </div>
                    <div className="gap-2 flex shrink-0 flex-wrap items-center">
                      {isCurrent ? (
                        <Badge variant="ink">In use</Badge>
                      ) : isAllowed ? (
                        <Badge variant="success">Allowed</Badge>
                      ) : (
                        <Badge variant="muted">Not allowed</Badge>
                      )}
                      {canApply && !isCurrent && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!!blocker}
                          title={blocker ?? undefined}
                          onClick={() => apply(t.id, t.name)}
                        >
                          Apply template
                        </Button>
                      )}
                    </div>
                  </div>
                  {canApply && !isCurrent && blocker && (
                    <p className="mt-2 text-[0.6875rem] text-muted">{blocker}</p>
                  )}
                </li>
              )
            })}
          </ul>
          {canAdmin && dirty && (
            <div className="mt-3 gap-2 rounded-2xl px-3 py-2 flex flex-wrap items-center justify-between bg-surface-2">
              <p className="text-xs text-muted">
                Allowed templates changed. Save to let the seller use them.
              </p>
              <div className="gap-2 flex">
                <Button variant="ghost" size="sm" onClick={() => setAllowed(seller.allowedTemplateIds)}>
                  Reset
                </Button>
                <Button
                  size="sm"
                  disabled={!allowed.length}
                  title={allowed.length ? undefined : 'Allow at least one template.'}
                  onClick={saveAllowed}
                >
                  Save allowed templates
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="gap-2 flex flex-wrap items-center justify-between">
            <Kicker>Preview · {current?.name ?? 'No template'}</Kicker>
            <PillTabs
              size="sm"
              items={DEVICES.map((d) => ({ value: d, label: DEVICE_LABEL[d] }))}
              value={device}
              onValueChange={(v) => setDevice(v as Device)}
            />
          </div>
          {page ? (
            <LiveStorefront
              tenant={s.tenant}
              device={device}
              page={page}
              className="mt-2"
              fallback={simplePreview}
            />
          ) : (
            simplePreview
          )}
          <p className="mt-2 gap-x-2 text-xs flex flex-wrap items-center text-muted">
            <span className="font-mono">{storeUrl(s.tenant, seller)}</span>
            {page ? (
              <>
                <span>·</span>
                <span>{PAGE_STATUS_LABEL[page.status]}</span>
                <span>·</span>
                <Link to={paths.page(page.id)} className="font-semibold text-foreground hover:text-accent">
                  Edit content
                </Link>
              </>
            ) : (
              <span>· No page yet. The preview fills the template with the seller profile.</span>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
