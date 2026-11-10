import { pageWithDraft, sectionsInOrder } from '@rc/fixtures'
import { PAGE_KIND_LABEL, PAGE_STATUS_LABEL, type Device, type Page, type PageDraft } from '@rc/types'
import {
  Badge,
  Button,
  Card,
  Combobox,
  ConfirmDialog,
  EmptyState,
  PillTabs,
  SegmentedControl,
  Tooltip,
  toast,
  useElementSize,
  useMediaQuery,
} from '@rc/ui'
import {
  CircleAlert,
  Check,
  ExternalLink,
  History,
  LoaderCircle,
  Monitor,
  Plus,
  Redo2,
  Rocket,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { LiveStorefront } from '../../components/LiveStorefront'
import { StorefrontPreview } from '../../components/StorefrontPreview'
import { storeAddress, storefrontUrl } from '../../lib/storefront'
import { useScoped } from '../../state/scoped'
import { NewPageDialog, createHomePage } from './NewPageDialog'
import { PublishDialog } from './PublishDialog'
import { QuickAddProduct } from './QuickAddProduct'
import { SectionForm } from './SectionForm'
import { SectionList } from './SectionList'
import { SeoFields } from './SeoFields'
import { VersionHistory } from './VersionHistory'
import { seoFor, withOrder } from './lib'
import { type SaveState, useDraft } from './useDraft'

const DEVICES: { value: Device; label: string; icon: typeof Monitor }[] = [
  { value: 'desktop', label: 'Desktop', icon: Monitor },
  { value: 'tablet', label: 'Tablet', icon: Tablet },
  { value: 'mobile', label: 'Phone', icon: Smartphone },
]

/** `/store/editor`: pick a section, change it on the right, watch the store update, publish. */
export function StoreEditorPage() {
  const s = useScoped()
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const pages = s.pages.filter((p) => !p.sellerId && p.kind !== 'personal')
  const home = pages.find((p) => p.kind === 'home')
  const page = pages.find((p) => p.id === params.get('page')) ?? home
  const open = (id: string) => setParams({ page: id }, { replace: true })

  if (!can('store.manage'))
    return (
      <Card>
        <EmptyState
          title="You can look but not edit"
          description="Editing the store needs store access. Ask the store owner to give it to you."
          action={
            <Button asChild variant="outline">
              <a href={storefrontUrl(s.tenant.subdomain)} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                Open the store
              </a>
            </Button>
          }
        />
      </Card>
    )
  if (!page)
    return (
      <Card>
        <EmptyState
          title="Your store has no home page yet"
          description="Start one from a layout, then change every part of it here."
          action={
            <Button onClick={() => open(createHomePage(s))}>
              <Plus />
              Create the home page
            </Button>
          }
        />
      </Card>
    )
  return <Editor key={page.id} page={page} pages={pages} onOpenPage={open} />
}

function Editor({
  page,
  pages,
  onOpenPage,
}: {
  page: Page
  pages: Page[]
  onOpenPage: (id: string) => void
}) {
  const s = useScoped()
  const pending = s.pageDrafts.find((d) => d.id === page.id) ?? null
  const { draft, state, change, save, reset, undo, redo, canUndo, canRedo } = useDraft(page, pending)
  const [selected, setSelected] = useState<string | null>(
    () => draft.sections.find((x) => x.kind !== 'footer')?.id ?? null,
  )
  const [device, setDevice] = useState<Device>('desktop')
  const [tab, setTab] = useState<'sections' | 'edit'>('sections')
  const [dialog, setDialog] = useState<'publish' | 'history' | 'page' | 'product' | 'discard' | null>(null)
  const wide = useMediaQuery('(min-width: 1280px)')
  const [box, size] = useElementSize<HTMLDivElement>()
  const frame = useRef<{ openTab: () => void }>(null)

  const section = draft.sections.find((x) => x.id === selected) ?? null
  // The preview shows the edits; the live store keeps the page shoppers see until a publish.
  const preview: Page = {
    ...pageWithDraft(page, pending),
    sections: withOrder(draft.sections),
    seo: draft.seo,
  }
  // A live page has changes to publish once its draft exists or an edit is on its way there.
  const changes = !!pending || (page.status !== 'draft' && state !== 'saved')
  const isLive = page.status === 'published' && !changes
  const liveUrl = storefrontUrl(s.tenant.subdomain, page.kind === 'home' ? '' : page.slug)

  const discard = async () => {
    setDialog(null)
    try {
      await s.dispatchAsync({ type: 'pages/discardDraft', id: page.id })
      reset(
        sectionsInOrder(page.sections, s.maps.template.get(page.templateId) ?? null),
        seoFor(page, s.tenant),
      )
      toast('Changes discarded', { tone: 'success', description: 'The editor shows the saved page again.' })
    } catch (err) {
      toast('The changes were not discarded', {
        tone: 'danger',
        description: err instanceof Error ? err.message : 'The server did not answer. Try again.',
      })
    }
  }

  const select = (id: string) => {
    if (!draft.sections.some((x) => x.id === id)) return
    setSelected(id)
    setTab('edit')
  }

  // Cmd/Ctrl+Z undoes and Shift+Cmd/Ctrl+Z redoes, except while typing, where the field undoes itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const list = (
    <SectionList
      sections={draft.sections}
      selected={selected}
      onSelect={select}
      change={change}
      onAddProduct={() => setDialog('product')}
      footer={<SeoFields seo={draft.seo} change={change} />}
    />
  )
  const form = section ? (
    <SectionForm
      key={section.id}
      section={section}
      change={change}
      onAddProduct={() => setDialog('product')}
    />
  ) : (
    <EmptyState title="Pick a section" description="Choose one in the list or click it in the preview." />
  )

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Store editor</h1>
      <div className="gap-3 flex flex-wrap items-center justify-between">
        <div className="min-w-0 gap-2 flex flex-wrap items-center">
          <Combobox
            aria-label="Page to edit"
            className="w-56"
            items={pages}
            value={page.id}
            onChange={(id) => id && id !== page.id && onOpenPage(id)}
            getKey={(p) => p.id}
            getLabel={(p) => p.title}
            getDescription={(p) =>
              `${PAGE_KIND_LABEL[p.kind]} · ${PAGE_STATUS_LABEL[p.status]}${s.pageDrafts.some((d) => d.id === p.id) ? ' · unpublished changes' : ''}`
            }
            searchPlaceholder="Search pages"
          />
          <Button variant="ghost" size="sm" onClick={() => setDialog('page')}>
            <Plus />
            New page
          </Button>
          <Tooltip content="Open the live store: what shoppers see now, without unpublished changes">
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open live store"
              className="min-w-0 text-xs font-medium truncate text-muted hover:text-foreground hover:underline"
            >
              {storeAddress(s.tenant)}
              {page.kind === 'home' ? '' : page.slug}
            </a>
          </Tooltip>
        </div>
        <div className="gap-2 flex flex-wrap items-center">
          <PageStatus
            page={page}
            pending={pending}
            saving={state === 'saving'}
            onDiscard={() => setDialog('discard')}
          />
          <SaveBadge state={state} onRetry={() => void save()} />
          <Tooltip content="Undo (Ctrl+Z)">
            <Button variant="outline" size="icon-sm" onClick={undo} disabled={!canUndo} aria-label="Undo">
              <Undo2 />
            </Button>
          </Tooltip>
          <Tooltip content="Redo (Shift+Ctrl+Z)">
            <Button variant="outline" size="icon-sm" onClick={redo} disabled={!canRedo} aria-label="Redo">
              <Redo2 />
            </Button>
          </Tooltip>
          <Button variant="outline" size="sm" onClick={() => setDialog('history')}>
            <History />
            Version history
          </Button>
          <Button variant="outline" size="sm" onClick={() => frame.current?.openTab()}>
            <ExternalLink />
            Preview
          </Button>
          <Button size="lg" onClick={() => setDialog('publish')}>
            {isLive ? <Check /> : <Rocket />}
            {isLive ? 'Live' : changes ? 'Publish changes' : 'Publish'}
          </Button>
        </div>
      </div>

      <div className="gap-4 xl:grid-cols-[300px_minmax(0,1fr)_340px] grid grid-cols-1">
        {wide ? (
          <Card className="min-w-0 p-3 xl:h-[calc(var(--admin-viewport-height)-11rem)] overflow-y-auto">{list}</Card>
        ) : (
          <Card className="min-w-0 p-3">
            <PillTabs
              size="sm"
              value={tab}
              onValueChange={(v) => setTab(v === 'edit' ? 'edit' : 'sections')}
              items={[
                { value: 'sections', label: 'Sections' },
                { value: 'edit', label: section ? 'Edit section' : 'Edit' },
              ]}
              className="mb-3"
            />
            <div className="max-h-[60dvh] overflow-y-auto">{tab === 'sections' ? list : form}</div>
          </Card>
        )}

        <Card className="min-w-0 p-3 xl:h-[calc(var(--admin-viewport-height)-11rem)] flex flex-col">
          <div ref={box} className="min-h-0 flex-1">
            <LiveStorefront
              ref={frame}
              tenant={s.tenant}
              device={device}
              page={preview}
              height={wide ? Math.max(420, size.height - 44) : 560}
              selectedSectionId={selected}
              onSelectSection={select}
              toolbar={
                <SegmentedControl
                  size="sm"
                  value={device}
                  onChange={(v) => setDevice(DEVICES.find((d) => d.value === v)?.value ?? 'desktop')}
                  options={DEVICES.map((d) => ({
                    value: d.value,
                    label: <span className="sm:not-sr-only sr-only">{d.label}</span>,
                    icon: <d.icon className="size-4" aria-hidden="true" />,
                  }))}
                />
              }
              fallback={
                <StorefrontPreview
                  brand={s.tenant.brand}
                  storeName={s.tenant.name}
                  sections={preview.sections}
                  device={device}
                  products={s.maps.product}
                />
              }
            />
          </div>
        </Card>

        {wide && <Card className="min-w-0 p-4 xl:h-[calc(var(--admin-viewport-height)-11rem)] overflow-y-auto">{form}</Card>}
      </div>

      {dialog === 'publish' && (
        <PublishDialog
          page={preview}
          saved={pageWithDraft(page, pending)}
          changes={changes}
          save={save}
          liveUrl={liveUrl}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'history' && (
        <VersionHistory page={page} onRestore={reset} onClose={() => setDialog(null)} />
      )}
      {dialog === 'page' && (
        <NewPageDialog
          onCreated={(id) => {
            setDialog(null)
            onOpenPage(id)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'product' && <QuickAddProduct onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog === 'discard'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Discard your unpublished changes?"
        description={`The editor goes back to the page ${page.status === 'published' ? 'shoppers see now' : 'as it is scheduled to go live'}. You cannot undo this.`}
        confirmLabel="Discard changes"
        destructive
        onConfirm={() => void discard()}
      />
    </div>
  )
}

/** Whether shoppers see the page, and whether edits wait to be published. */
function PageStatus({
  page,
  pending,
  saving,
  onDiscard,
}: {
  page: Page
  pending: PageDraft | null
  saving: boolean
  onDiscard: () => void
}) {
  if (pending)
    return (
      <span className="gap-1 flex items-center">
        <Badge variant="warning">Unpublished changes</Badge>
        <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
          <Trash2 />
          Discard changes
        </Button>
      </span>
    )
  if (page.status === 'published') return <Badge variant="ink">Live</Badge>
  if (page.status === 'scheduled') return <Badge variant="info">Scheduled</Badge>
  return <Badge variant="muted">Draft, not published yet</Badge>
}

function SaveBadge({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === 'error')
    return (
      <Button variant="danger" size="sm" onClick={onRetry}>
        <CircleAlert />
        Not saved. Try again
      </Button>
    )
  return (
    <Badge variant={state === 'saving' ? 'muted' : 'success'} aria-live="polite">
      {state === 'saving' ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <Check aria-hidden="true" />
      )}
      {state === 'saving' ? 'Saving…' : 'Saved'}
    </Badge>
  )
}
