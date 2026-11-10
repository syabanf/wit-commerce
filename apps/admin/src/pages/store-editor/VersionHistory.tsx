import { fmtWhen, pageEditsGoToDraft, plural, sectionsInOrder } from '@rc/fixtures'
import type { Page, PageRevision, PageSection } from '@rc/types'
import {
  Badge,
  Button,
  ConfirmDialog,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  cn,
  toast,
} from '@rc/ui'
import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useNow, useScoped } from '../../state/scoped'

/** Earlier versions of the page, newest first. Restoring one keeps the current version in the list. */
export function VersionHistory({
  page,
  onRestore,
  onClose,
}: {
  page: Page
  onRestore: (sections: PageSection[]) => void
  onClose: () => void
}) {
  const s = useScoped()
  const now = useNow(60_000)
  const [restoring, setRestoring] = useState<PageRevision | null>(null)
  // On a live page a restored version waits in the draft until the owner publishes it.
  const toDraft = pageEditsGoToDraft(
    page,
    s.pageDrafts.find((d) => d.id === page.id),
  )

  const restore = async (rev: PageRevision) => {
    setRestoring(null)
    try {
      await s.dispatchAsync({ type: 'pages/rollback', id: page.id, revisionId: rev.id })
      onRestore(sectionsInOrder(rev.sections, s.maps.template.get(rev.templateId) ?? null))
      toast(toDraft ? 'Version restored in the editor' : 'Version restored', {
        tone: 'success',
        description: toDraft
          ? `${rev.note}, ${fmtWhen(rev.at, now)}. Publish to show it to shoppers.`
          : `${rev.note}, ${fmtWhen(rev.at, now)}.`,
      })
      onClose()
    } catch (err) {
      toast('The version was not restored', {
        tone: 'danger',
        description: err instanceof Error ? err.message : 'The server did not answer. Try again.',
      })
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Version history</SheetTitle>
          <SheetDescription>
            The last {plural(page.revisions.length, 'version')} of {page.title}.
            {toDraft && ' A new version is saved each time you publish.'}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <ol className="space-y-3 pl-5 relative border-l border-border">
            {page.revisions.map((rev, i) => (
              <li key={rev.id} className="relative">
                <span
                  aria-hidden="true"
                  className={cn(
                    'top-1.5 size-3 absolute -left-[1.625rem] rounded-full ring-4 ring-card',
                    i === 0 ? (page.status === 'published' ? 'bg-success' : 'bg-warning') : 'bg-border',
                  )}
                />
                <div className="gap-2 flex flex-wrap items-start justify-between">
                  <div className="min-w-0">
                    <p className="gap-2 text-sm font-medium flex flex-wrap items-center">
                      {rev.note}
                      {i === 0 && (
                        <Badge variant="ink">{page.status === 'published' ? 'Live' : 'Current'}</Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {s.userName(rev.by)} · {fmtWhen(rev.at, now)} · {plural(rev.sections.length, 'section')}
                    </p>
                  </div>
                  {i > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setRestoring(rev)}>
                      <RotateCcw />
                      Restore
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </SheetBody>
      </SheetContent>
      <ConfirmDialog
        open={!!restoring}
        onOpenChange={(open) => !open && setRestoring(null)}
        title="Go back to this version?"
        description={
          restoring
            ? toDraft
              ? `The editor goes back to "${restoring.note}" from ${fmtWhen(restoring.at, now)}. Shoppers keep seeing the current page until you publish.`
              : `The page goes back to "${restoring.note}" from ${fmtWhen(restoring.at, now)}. The current version stays in the list.`
            : undefined
        }
        confirmLabel="Restore version"
        onConfirm={() => restoring && void restore(restoring)}
      />
    </Sheet>
  )
}
