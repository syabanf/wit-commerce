import { DAY, fmtDateTime, fmtNumber, nowMs, pagePublishBlocker, toIso, toMs } from '@rc/fixtures'
import type { Device, Page } from '@rc/types'
import { DEVICE_LABEL, PAGE_KIND_LABEL } from '@rc/types'
import {
  ActionMenu,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  FormField,
  Input,
  KeyValue,
  PillTabs,
  cn,
  toast,
} from '@rc/ui'
import { CalendarClock, ExternalLink, EyeOff, Lock, MoreHorizontal, Send } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { PageStatusBadge } from '../../components/badges'
import { SellerChip } from '../../components/links'
import { StorefrontPreview } from '../../components/StorefrontPreview'
import { LiveStorefront } from '../../components/LiveStorefront'
import { useScoped } from '../../state/scoped'
import { RevisionHistory } from './RevisionHistory'
import { TemplateChooser } from './TemplateChooser'
import { liveUrl } from './lib'

const DEVICES: Device[] = ['desktop', 'tablet', 'mobile']
type Pending = 'schedule' | 'unpublish' | null

export function PageEditorPage() {
  const { id } = useParams()
  const s = useScoped()
  const page = s.pages.find((p) => p.id === id)
  if (!page) {
    return (
      <Card>
        <EmptyState
          title="Page not found"
          description="It may have been removed or belongs to another brand."
          action={<BackButton fallback="/store/pages" />}
        />
      </Card>
    )
  }
  return <PageDetail page={page} />
}

function PageDetail({ page }: { page: Page }) {
  const s = useScoped()
  const { can } = useAuth()
  const [device, setDevice] = useState<Device>('desktop')
  const [pending, setPending] = useState<Pending>(null)
  const canEdit = can('store.manage')
  const seller = page.sellerId ? (s.maps.seller.get(page.sellerId) ?? null) : null
  const template = s.maps.template.get(page.templateId)
  const blocker = pagePublishBlocker(page)
  const url = liveUrl(s.tenant, page.slug)
  const live = page.status === 'published'

  const publish = () => {
    if (blocker) return toast('Page not published', { tone: 'danger', description: blocker })
    s.dispatch({ type: 'pages/publish', id: page.id })
    toast('Page published', { tone: 'success', description: `${page.title} is live at ${url}.` })
  }

  const openLive = () => {
    void navigator.clipboard?.writeText(url).catch(() => undefined)
    toast('Live page link copied', {
      description: `${url}. This demo has no public storefront, so the preview here is the page shoppers see.`,
    })
  }

  const menu = [
    canEdit && !live
      ? {
          key: 'schedule',
          label: page.status === 'scheduled' ? 'Change schedule' : 'Schedule publish',
          description: blocker ?? 'Goes live on the date you set',
          icon: <CalendarClock />,
          disabled: !!blocker,
          onSelect: () => setPending('schedule'),
        }
      : null,
    canEdit && page.status !== 'draft'
      ? {
          key: 'unpublish',
          label: 'Unpublish',
          description: 'Back to draft, hidden from shoppers',
          icon: <EyeOff />,
          onSelect: () => setPending('unpublish'),
        }
      : null,
    live
      ? { key: 'live', label: 'Open live page', description: url, icon: <ExternalLink />, onSelect: openLive }
      : null,
  ].filter((item) => item !== null)

  return (
    <div className="space-y-4">
      <div className="gap-3 flex flex-wrap items-center justify-between">
        <div className="min-w-0 gap-2 flex flex-wrap items-center">
          <BackButton fallback="/store/pages" />
          <h1 className="min-w-0 text-xl font-bold tracking-tight truncate">{page.title}</h1>
          <PageStatusBadge status={page.status} />
          {!canEdit && (
            <Badge variant="muted">
              <Lock />
              View only
            </Badge>
          )}
        </div>
        <div className="gap-2 flex flex-wrap items-center">
          {canEdit && !live && (
            <Button onClick={publish} disabled={!!blocker} title={blocker ?? undefined}>
              <Send />
              Publish
            </Button>
          )}
          {menu.length > 0 && (
            <ActionMenu
              title={page.title}
              trigger={
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              }
              items={menu}
            />
          )}
        </div>
      </div>

      <p className="gap-x-2 gap-y-1 text-sm flex flex-wrap items-center text-muted">
        <span className="text-xs font-mono text-foreground">{page.slug}</span>
        <span>·</span>
        <span>{PAGE_KIND_LABEL[page.kind]}</span>
        <span>·</span>
        <span>{template?.name ?? 'Removed template'}</span>
        {seller && (
          <>
            <span>·</span>
            <SellerChip sellerId={seller.id} />
          </>
        )}
        <span>·</span>
        <span>{fmtNumber(page.views30d)} views in 30 days</span>
        {page.status === 'scheduled' && page.scheduledAt && (
          <>
            <span>·</span>
            <span className="font-semibold text-info">Goes live {fmtDateTime(page.scheduledAt)}</span>
          </>
        )}
      </p>

      {canEdit && !live && blocker && (
        <Card className="p-4 text-sm">
          <span className="font-semibold">Cannot publish yet:</span> {blocker}
        </Card>
      )}

      {canEdit && <TemplateChooser page={page} seller={seller} />}

      <div className="gap-4 xl:grid-cols-[minmax(0,1fr)_340px] grid grid-cols-1">
        <Card className="min-w-0">
          <CardHeader
            action={
              <PillTabs
                size="sm"
                value={device}
                onValueChange={(v) => setDevice(DEVICES.find((d) => d === v) ?? 'desktop')}
                items={DEVICES.map((d) => ({ value: d, label: DEVICE_LABEL[d] }))}
              />
            }
          >
            <CardTitle>Preview</CardTitle>
            <CardDescription>Content, template and brand tokens, as shoppers see the page.</CardDescription>
          </CardHeader>
          <CardContent>
            <LiveStorefront
              tenant={s.tenant}
              device={device}
              page={page}
              height={720}
              fallback={
                <StorefrontPreview
                  brand={s.tenant.brand}
                  storeName={s.tenant.name}
                  sections={page.sections}
                  device={device}
                  products={s.maps.product}
                  seller={seller}
                />
              }
            />
          </CardContent>
        </Card>
        <div className="min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-1 grid grid-cols-1 content-start">
          <SeoCard page={page} url={url} />
          <RevisionHistory page={page} editable={canEdit} />
        </div>
      </div>

      {pending === 'schedule' && <ScheduleDialog page={page} onClose={() => setPending(null)} />}
      <ConfirmDialog
        open={pending === 'unpublish'}
        onOpenChange={(open) => !open && setPending(null)}
        destructive
        title={`Unpublish ${page.title}?`}
        description={`Shoppers who open ${url} see a not-found page until you publish it again.`}
        confirmLabel="Unpublish"
        onConfirm={() => {
          s.dispatch({ type: 'pages/unpublish', id: page.id })
          toast('Page unpublished', { description: `${page.title} is back to draft.` })
          setPending(null)
        }}
      />
    </div>
  )
}

const TITLE_MAX = 60
const DESCRIPTION_MAX = 160

function SeoCard({ page, url }: { page: Page; url: string }) {
  const length = (text: string, max: number) => {
    const n = text.trim().length
    return (
      <span className={cn('text-[0.6875rem] tabular-nums', n > max ? 'font-semibold text-warning' : 'text-muted')}>
        {n ? `${n} of ${max} characters` : 'Missing'}
      </span>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Search listing</CardTitle>
        <CardDescription className="text-xs truncate font-mono">{url}</CardDescription>
      </CardHeader>
      <CardContent>
        <KeyValue
          bare
          labelWidth="sm"
          items={[
            {
              label: 'Meta title',
              value: (
                <span className="min-w-0 block">
                  <span className="block break-words">{page.seo.title || 'None'}</span>
                  {length(page.seo.title, TITLE_MAX)}
                </span>
              ),
            },
            {
              label: 'Description',
              value: (
                <span className="min-w-0 block">
                  <span className="block break-words">{page.seo.description || 'None'}</span>
                  {length(page.seo.description, DESCRIPTION_MAX)}
                </span>
              ),
            },
          ]}
        />
      </CardContent>
    </Card>
  )
}

/** datetime-local value in WIB, the app's timezone. */
const toLocalInput = (ms: number) => toIso(ms).slice(0, 16)

function ScheduleDialog({ page, onClose }: { page: Page; onClose: () => void }) {
  const s = useScoped()
  const [value, setValue] = useState(() =>
    toLocalInput(page.scheduledAt ? toMs(page.scheduledAt) : nowMs() + DAY),
  )
  const at = value ? `${value}:00+07:00` : ''
  const error = !value
    ? 'Choose a date and time.'
    : toMs(at) <= nowMs()
      ? 'Choose a time in the future.'
      : null
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Schedule ${page.title}?`}
      description="The page goes live on its own at this time. Times are in WIB."
      confirmLabel="Schedule publish"
      confirmDisabled={!!error}
      onConfirm={() => {
        if (error) return
        s.dispatch({ type: 'pages/schedule', id: page.id, at })
        toast('Publish scheduled', {
          tone: 'success',
          description: `${page.title} goes live ${fmtDateTime(at)}.`,
        })
        onClose()
      }}
    >
      <FormField label="Publish at" required error={error ?? undefined}>
        <Input
          variant="soft"
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </FormField>
    </ConfirmDialog>
  )
}
