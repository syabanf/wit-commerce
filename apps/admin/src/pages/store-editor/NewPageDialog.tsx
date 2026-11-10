import { newId, nowIso } from '@rc/fixtures'
import type { Page, PageKind, Template } from '@rc/types'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  cn,
  toast,
} from '@rc/ui'
import { useState } from 'react'
import type { Scoped } from '../../state/scoped'
import { useScoped } from '../../state/scoped'
import { NEW_PAGES, freeSlug, newSection, seoFor, templateForNewPage } from './lib'

/** A draft page laid out from a template, with the hero and button sections titled so it can go live. */
function draftPage(s: Scoped, kind: PageKind, title: string, slug: string, template: Template): Page {
  const at = nowIso()
  const sections = template.sections.map(({ kind: sectionKind, rule }) => ({
    ...newSection(sectionKind, s.tenant),
    rule,
    ...(kind !== 'home' && sectionKind === 'hero' && { headline: title }),
  }))
  const page: Page = {
    id: newId('page'),
    tenantId: s.tenantId,
    title,
    slug,
    kind,
    templateId: template.id,
    sellerId: null,
    status: 'draft',
    sections,
    seo: { title: '', description: '' },
    updatedAt: at,
    updatedBy: s.user.id,
    publishedAt: null,
    scheduledAt: null,
    revisions: [
      {
        id: newId('rev'),
        at,
        by: s.user.id,
        note: 'Created from a layout',
        sections,
        templateId: template.id,
      },
    ],
    views30d: 0,
  }
  return { ...page, seo: seoFor(page, s.tenant) }
}

/** Creates the store's home page from the first store layout and returns its id. */
export function createHomePage(s: Scoped): string {
  const template = s.templates.find((t) => t.scope === 'store')!
  const page = draftPage(s, 'home', 'Home', '/', template)
  s.dispatch({ type: 'pages/create', page })
  return page.id
}

/** Adds an About, FAQ, landing or campaign page from a fitting layout. */
export function NewPageDialog({
  onCreated,
  onClose,
}: {
  onCreated: (id: string) => void
  onClose: () => void
}) {
  const s = useScoped()
  const [kind, setKind] = useState<PageKind>('about')
  const [title, setTitle] = useState('About us')
  const [busy, setBusy] = useState(false)
  const template = templateForNewPage(kind, s.templates)
  const error = title.trim() ? null : 'Give the page a name.'

  const create = async () => {
    if (error || !template) return
    const taken = new Set([...s.pages.map((p) => p.slug), ...s.sellers.map((x) => `/${x.slug}`)])
    const page = draftPage(s, kind, title.trim(), freeSlug(title, taken), template)
    setBusy(true)
    try {
      await s.dispatchAsync({ type: 'pages/create', page })
      toast('Page created', {
        tone: 'success',
        description: `${page.title} is a draft until you publish it.`,
      })
      onCreated(page.id)
    } catch (err) {
      toast('The page was not created', {
        tone: 'danger',
        description: err instanceof Error ? err.message : 'The server did not answer. Try again.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <DialogHeader>
            <DialogTitle>New page</DialogTitle>
            <DialogDescription>It starts as a draft with sections to fill in.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">What kind of page?</legend>
              <div className="gap-2 grid grid-cols-2">
                {NEW_PAGES.map((p) => (
                  <button
                    key={p.kind}
                    type="button"
                    aria-pressed={kind === p.kind}
                    onClick={() => {
                      if (title === NEW_PAGES.find((x) => x.kind === kind)?.title) setTitle(p.title)
                      setKind(p.kind)
                    }}
                    className={cn(
                      'p-3 rounded-2xl text-left',
                      kind === p.kind ? 'bg-ink text-on-ink' : 'bg-surface hover:bg-surface-2',
                    )}
                  >
                    <span className="text-sm font-semibold block">{p.label}</span>
                    <span
                      className={cn('text-xs block', kind === p.kind ? 'text-on-ink-muted' : 'text-muted')}
                    >
                      {p.blurb}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
            <FormField label="Page name" required htmlFor="new-page-title" error={error ?? undefined}>
              <Input
                id="new-page-title"
                variant="soft"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!!error || !template}>
              Create page
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
