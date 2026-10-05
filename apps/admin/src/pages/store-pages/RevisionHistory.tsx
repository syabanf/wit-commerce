import { fmtWhen, plural } from '@rc/fixtures'
import type { Page, PageRevision } from '@rc/types'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  cn,
  toast,
} from '@rc/ui'
import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useNow, useScoped } from '../../state/scoped'

export function RevisionHistory({ page, editable }: { page: Page; editable: boolean }) {
  const s = useScoped()
  const now = useNow(60_000)
  const [restoring, setRestoring] = useState<PageRevision | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revision history</CardTitle>
        <CardDescription>The last {plural(page.revisions.length, 'version')}, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3 pl-5 relative border-l border-border">
          {page.revisions.map((rev, i) => {
            const current = i === 0
            return (
              <li key={rev.id} className="relative">
                <span
                  aria-hidden="true"
                  className={cn(
                    'top-1.5 size-3 absolute -left-[26px] rounded-full ring-4 ring-card',
                    current ? (page.status === 'published' ? 'bg-success' : 'bg-warning') : 'bg-border',
                  )}
                />
                <div className="gap-2 flex flex-wrap items-start justify-between">
                  <div className="min-w-0">
                    <p className="gap-2 text-sm font-medium flex flex-wrap items-center">
                      {rev.note}
                      {current && <Badge variant="ink">Current</Badge>}
                    </p>
                    <p className="text-[11px] text-muted">
                      {s.userName(rev.by)} · {fmtWhen(rev.at, now)} · {plural(rev.sections.length, 'section')}
                    </p>
                  </div>
                  {editable && !current && (
                    <Button variant="ghost" size="sm" onClick={() => setRestoring(rev)}>
                      <RotateCcw />
                      Restore
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </CardContent>
      <ConfirmDialog
        open={!!restoring}
        onOpenChange={(open) => !open && setRestoring(null)}
        title={`Restore ${page.title} to this version?`}
        description={
          restoring
            ? `The sections go back to "${restoring.note}" from ${fmtWhen(restoring.at, now)}. The current version stays in the history.${page.status === 'published' ? ' Shoppers see the change right away.' : ''}`
            : undefined
        }
        confirmLabel="Restore version"
        onConfirm={() => {
          if (!restoring) return
          s.dispatch({ type: 'pages/rollback', id: page.id, revisionId: restoring.id })
          toast('Version restored', {
            tone: 'success',
            description: `${page.title} · ${restoring.note}, ${fmtWhen(restoring.at, now)}.`,
          })
          setRestoring(null)
        }}
      />
    </Card>
  )
}
