import { LOOK_HERO_LABEL, LOOK_PRODUCTS_LABEL, lookFor } from '@rc/fixtures'
import type { Page, Seller, Template } from '@rc/types'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  cn,
  toast,
} from '@rc/ui'
import { useState } from 'react'
import { useScoped } from '../../state/scoped'
import { TemplateThumb } from '../templates/TemplateThumb'
import { templatesFor } from './lib'

/** The page's look comes from a template; content carries over when it switches. */
export function TemplateChooser({ page, seller }: { page: Page; seller: Seller | null }) {
  const s = useScoped()
  const [choosing, setChoosing] = useState<Template | null>(null)
  const options = templatesFor(page, s.templates, seller)

  const confirm = () => {
    if (!choosing) return
    s.dispatch({ type: 'pages/setTemplate', id: page.id, templateId: choosing.id })
    // Keep the seller's own template choice in step with their store page.
    if (seller) s.dispatch({ type: 'sellers/setTemplate', id: seller.id, templateId: choosing.id })
    toast('Template changed', {
      tone: 'success',
      description: `${page.title} now uses ${choosing.name}. Your content stayed.`,
    })
    setChoosing(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Template</CardTitle>
        <CardDescription>
          {seller
            ? `The templates the tenant allows for ${seller.name}. The brand guideline sets colours, type and buttons.`
            : 'Pick the layout for this page. The brand guideline sets colours, type and buttons.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {options.length ? (
          <div className="gap-3 sm:grid-cols-2 xl:grid-cols-4 grid grid-cols-1">
            {options.map((t) => {
              const current = t.id === page.templateId
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={current}
                  disabled={current}
                  onClick={() => setChoosing(t)}
                  className={cn(
                    'min-w-0 rounded-2xl p-3 flex flex-col bg-surface-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
                    current ? 'ring-2 ring-ink' : 'hover:bg-surface active:scale-[0.98]',
                  )}
                >
                  <TemplateThumb template={t} className="bg-surface" />
                  <span className="mt-3 gap-2 flex items-center justify-between">
                    <span className="text-sm font-semibold truncate">{t.name}</span>
                    {current && <Badge variant="ink">Current</Badge>}
                  </span>
                  <span className="mt-0.5 text-xs line-clamp-2 text-muted">{t.bestFor}</span>
                  <span className="mt-1 text-[11px] text-muted">
                    {LOOK_HERO_LABEL[lookFor(t.id).hero]} · {LOOK_PRODUCTS_LABEL[lookFor(t.id).products]} ·{' '}
                    {t.sections.length} sections
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <EmptyState
            compact
            title="No templates fit this page"
            description="Allow more templates for this seller on their seller page."
          />
        )}
      </CardContent>
      <ConfirmDialog
        open={!!choosing}
        onOpenChange={(open) => !open && setChoosing(null)}
        title={`Switch ${page.title} to ${choosing?.name ?? 'this template'}?`}
        description="Headline, text, products and buttons carry over to the matching sections. The hero, spacing and product layout change to the new template's look, live in the preview below."
        confirmLabel="Switch template"
        onConfirm={confirm}
      />
    </Card>
  )
}
