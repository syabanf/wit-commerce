import type { Device, Page, Template } from '@rc/types'
import { DEVICE_LABEL, SECTION_KIND_LABEL, SECTION_RULE_LABEL, TEMPLATE_SCOPE_LABEL } from '@rc/types'
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Kicker,
  PillTabs,
} from '@rc/ui'
import { nowIso } from '@rc/fixtures'
import { Lock, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/auth'
import { paths } from '../../components/links'
import { LiveStorefront } from '../../components/LiveStorefront'
import { StorefrontPreview } from '../../components/StorefrontPreview'
import { useScoped } from '../../state/scoped'
import { placeholderSections } from './lib'

export const SCOPE_VARIANT = { store: 'default', campaign: 'info', personal: 'outline' } as const

const DEVICES: Device[] = ['desktop', 'mobile']

type Props = { template: Template | null; onOpenChange: (open: boolean) => void }

export function TemplateDialog({ template, onOpenChange }: Props) {
  return (
    <Dialog open={!!template} onOpenChange={onOpenChange}>
      <DialogContent size="xl">{template && <TemplateDetail template={template} />}</DialogContent>
    </Dialog>
  )
}

function TemplateDetail({ template }: { template: Template }) {
  const s = useScoped()
  const { can } = useAuth()
  const navigate = useNavigate()
  const [device, setDevice] = useState<Device>('desktop')
  const personal = template.scope === 'personal'
  const using = s.sellers.filter((x) => x.templateId === template.id)
  const allowed = s.sellers.filter(
    (x) => x.allowedTemplateIds.includes(template.id) && x.templateId !== template.id,
  )
  const sampleSeller = personal ? (using[0] ?? allowed[0] ?? s.sellers[0] ?? null) : null

  const sections = useMemo(() => {
    const productIds = s.products.filter((p) => p.status === 'active').map((p) => p.id)
    return placeholderSections(template, s.tenant.brand.tagline, productIds)
  }, [template, s.products, s.tenant.brand.tagline])
  // An unsaved page that applies this template to the sample content, so the live preview can show it.
  const previewPage = useMemo<Page>(
    () => ({
      id: `preview-${template.id}`,
      tenantId: s.tenantId,
      title: template.name,
      slug: `preview-${template.id}`,
      kind: template.scope === 'store' ? 'home' : template.scope === 'personal' ? 'personal' : 'campaign',
      templateId: template.id,
      sellerId: sampleSeller?.id ?? null,
      status: 'draft',
      sections,
      seo: { title: template.name, description: template.description },
      updatedAt: nowIso(),
      updatedBy: 'preview',
      publishedAt: null,
      scheduledAt: null,
      revisions: [],
      views30d: 0,
    }),
    [template, s.tenantId, sampleSeller?.id, sections],
  )

  return (
    <>
      <DialogHeader>
        <DialogTitle className="gap-2 flex flex-wrap items-center">
          {template.name}
          <Badge variant={SCOPE_VARIANT[template.scope]}>{TEMPLATE_SCOPE_LABEL[template.scope]}</Badge>
        </DialogTitle>
        <DialogDescription>
          {template.description} Best for {template.bestFor.toLowerCase()}. Shown with sample content and your
          brand guideline.
        </DialogDescription>
      </DialogHeader>
      <div className="gap-4 lg:grid-cols-[minmax(0,1fr)_240px] grid grid-cols-1">
        <div className="min-w-0 space-y-3">
          <PillTabs
            size="sm"
            value={device}
            onValueChange={(v) => setDevice(DEVICES.find((d) => d === v) ?? 'desktop')}
            items={DEVICES.map((d) => ({ value: d, label: DEVICE_LABEL[d] }))}
          />
          <LiveStorefront
            tenant={s.tenant}
            device={device}
            page={previewPage}
            height={560}
            fallback={
              <div className="rounded-2xl max-h-[60vh] overflow-y-auto">
                <StorefrontPreview
                  brand={s.tenant.brand}
                  storeName={s.tenant.name}
                  sections={sections}
                  device={device}
                  products={s.maps.product}
                  seller={sampleSeller}
                />
              </div>
            }
          />
        </div>
        <div className="min-w-0 space-y-4">
          <div>
            <Kicker className="mb-2">Section rules</Kicker>
            <ol className="space-y-1.5">
              {template.sections.map((sec, i) => (
                <li
                  key={`${sec.kind}-${i}`}
                  className="gap-2 rounded-xl px-3 py-2 text-xs flex items-center justify-between bg-surface-2"
                >
                  <span className="min-w-0 gap-1.5 font-medium flex items-center">
                    <span className="truncate">{SECTION_KIND_LABEL[sec.kind]}</span>
                    {sec.rule === 'locked' && (
                      <Lock className="size-3 shrink-0 text-muted" aria-hidden="true" />
                    )}
                  </span>
                  <span
                    className={sec.rule === 'optional' ? 'shrink-0 text-muted' : 'font-semibold shrink-0'}
                  >
                    {SECTION_RULE_LABEL[sec.rule]}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[0.6875rem] text-muted">
              Required sections stay on every page. Locked sections render as the template sets them.
            </p>
          </div>
          {personal && (
            <div>
              <Kicker className="mb-2">Sellers</Kicker>
              <SellerList title="Using it" sellers={using} empty="No seller uses it yet." />
              <SellerList
                title="Allowed to switch to it"
                sellers={allowed}
                empty="No other seller is allowed it."
              />
            </div>
          )}
        </div>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Close</Button>
        </DialogClose>
        {!personal && can('store.manage') && (
          <Button onClick={() => navigate(`/store/pages?new=1&template=${template.id}`)}>
            <Plus />
            Create page from this template
          </Button>
        )}
      </DialogFooter>
    </>
  )
}

function SellerList({
  title,
  sellers,
  empty,
}: {
  title: string
  sellers: { id: string; name: string; color: string }[]
  empty: string
}) {
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs font-semibold">{title}</p>
      {sellers.length ? (
        <ul className="space-y-1">
          {sellers.map((x) => (
            <li key={x.id}>
              <Link
                to={paths.seller(x.id)}
                className="min-w-0 gap-2 rounded-xl px-2 py-1 text-sm flex items-center hover:bg-surface-2 hover:text-accent"
              >
                <Avatar name={x.name} color={x.color} size="xs" />
                <span className="truncate">{x.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">{empty}</p>
      )}
    </div>
  )
}
