import { newId, nowIso, slugify } from '@rc/fixtures'
import type { Page, PageKind } from '@rc/types'
import { PAGE_KIND_LABEL, TEMPLATE_SCOPE_LABEL } from '@rc/types'
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
  NativeSelect,
  toast,
} from '@rc/ui'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '../../components/links'
import { TemplatePicker } from '../../components/pickers'
import { useScoped } from '../../state/scoped'
import { NEW_PAGE_KINDS, scopeForKind, sectionsFromTemplate } from './lib'

type Props = { open: boolean; onOpenChange: (open: boolean) => void; templateId: string | null }

export function NewPageDialog({ open, onOpenChange, templateId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        {open && <NewPageForm templateId={templateId} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function NewPageForm({ templateId, onCancel }: { templateId: string | null; onCancel: () => void }) {
  const s = useScoped()
  const navigate = useNavigate()
  const preset = templateId ? s.maps.template.get(templateId) : undefined
  const usable = preset && preset.scope !== 'personal' ? preset : undefined
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [kind, setKind] = useState<PageKind>(usable?.scope === 'store' ? 'collection' : 'landing')
  const [template, setTemplate] = useState<string | null>(usable?.id ?? null)
  const [tried, setTried] = useState(false)

  const finalSlug = slugEdited ? slugify(slug) : slugify(title)
  const taken = new Set(s.pages.map((p) => p.slug))
  const errors = {
    title: title.trim() ? null : 'Enter a page title.',
    slug: !finalSlug
      ? 'Enter a URL slug with letters or numbers.'
      : taken.has(`/${finalSlug}`)
        ? `Another page already uses /${finalSlug}. Choose a different slug.`
        : null,
    template: template ? null : 'Choose a template.',
  }
  const show = (message: string | null) => (tried ? (message ?? undefined) : undefined)
  const scope = scopeForKind(kind)

  const changeKind = (next: PageKind) => {
    setKind(next)
    const current = template ? s.maps.template.get(template) : undefined
    if (current && current.scope !== scopeForKind(next)) setTemplate(null)
  }

  const submit = () => {
    setTried(true)
    const tpl = template ? s.maps.template.get(template) : undefined
    if (Object.values(errors).some(Boolean) || !tpl) return
    const at = nowIso()
    const sections = sectionsFromTemplate(tpl, title.trim())
    const page: Page = {
      id: newId('page'),
      tenantId: s.tenantId,
      title: title.trim(),
      slug: `/${finalSlug}`,
      kind,
      templateId: tpl.id,
      sellerId: null,
      status: 'draft',
      sections,
      seo: { title: `${title.trim()} · ${s.tenant.name}`, description: '' },
      updatedAt: at,
      updatedBy: s.user.id,
      publishedAt: null,
      scheduledAt: null,
      revisions: [
        { id: newId('rev'), at, by: s.user.id, note: 'Created from template', sections, templateId: tpl.id },
      ],
      views30d: 0,
    }
    s.dispatch({ type: 'pages/create', page })
    toast('Page created', {
      tone: 'success',
      description: `${page.title} · ${tpl.name}, ${sections.length} sections. Publish it when it is ready.`,
    })
    navigate(paths.page(page.id))
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>New page</DialogTitle>
        <DialogDescription>
          The template sets the sections and the brand guideline sets the look. The page starts as a draft, so
          nothing goes live until you publish.
        </DialogDescription>
      </DialogHeader>
      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        <FormField
          label="Title"
          required
          htmlFor="page-title"
          error={show(errors.title)}
          className="sm:col-span-2"
        >
          <Input
            id="page-title"
            variant="soft"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Summit Ultra launch"
          />
        </FormField>
        <FormField
          label="URL slug"
          required
          htmlFor="page-slug"
          error={show(errors.slug)}
          hint={slugEdited ? undefined : 'Follows the title until you edit it.'}
        >
          <Input
            id="page-slug"
            variant="soft"
            inputClassName="font-mono"
            leftIcon={<span className="text-sm font-mono">/</span>}
            value={slugEdited ? slug : finalSlug}
            onChange={(e) => {
              setSlugEdited(true)
              setSlug(e.target.value)
            }}
            onBlur={() => slugEdited && setSlug(slugify(slug))}
          />
        </FormField>
        <FormField label="Kind" required htmlFor="page-kind">
          <NativeSelect
            id="page-kind"
            variant="soft"
            value={kind}
            onChange={(e) => {
              const next = NEW_PAGE_KINDS.find((k) => k === e.target.value)
              if (next) changeKind(next)
            }}
            options={NEW_PAGE_KINDS.map((k) => ({ value: k, label: PAGE_KIND_LABEL[k] }))}
          />
        </FormField>
        <FormField
          label="Template"
          required
          htmlFor="page-template"
          error={show(errors.template)}
          hint={`${TEMPLATE_SCOPE_LABEL[scope]} templates fit a ${PAGE_KIND_LABEL[kind].toLowerCase()}.`}
          className="sm:col-span-2"
        >
          <TemplatePicker
            id="page-template"
            variant="soft"
            scope={scope}
            value={template}
            onChange={setTemplate}
            invalid={!!show(errors.template)}
          />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Create page</Button>
      </DialogFooter>
    </form>
  )
}
