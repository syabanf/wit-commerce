import { collectionProducts, newId, plural } from '@rc/fixtures'
import { COLLECTION_MODE_LABEL, type Collection, type CollectionMode } from '@rc/types'
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
  MultiCombobox,
  SegmentedControl,
  Switch,
  Textarea,
} from '@rc/ui'
import { type FormEvent, useMemo, useState } from 'react'
import { CategoriesPicker, ProductsPicker } from '../../components/pickers'
import { useScoped } from '../../state/scoped'
import { SLUG, slugify } from './lib'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Collection | null
  onSaved: (c: Collection) => void
}

const MODES = (['manual', 'smart'] as const).map((m) => ({ value: m, label: COLLECTION_MODE_LABEL[m] }))

export function CollectionDialog({ open, onOpenChange, editing, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {open && (
          <CollectionForm
            editing={editing}
            onDone={(saved) => {
              onOpenChange(false)
              if (saved) onSaved(saved)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CollectionForm({
  editing,
  onDone,
}: {
  editing: Collection | null
  onDone: (saved: Collection | null) => void
}) {
  const s = useScoped()
  const [name, setName] = useState(editing?.name ?? '')
  // The slug follows the name until the user types one of their own.
  const [slug, setSlug] = useState<string | null>(editing?.slug ?? null)
  const [description, setDescription] = useState(editing?.description ?? '')
  const [mode, setMode] = useState<CollectionMode>(editing?.mode ?? 'manual')
  const [productIds, setProductIds] = useState<string[]>(editing?.productIds ?? [])
  const [ruleCategoryIds, setRuleCategoryIds] = useState<string[]>(editing?.ruleCategoryIds ?? [])
  const [ruleTags, setRuleTags] = useState<string[]>(editing?.ruleTags ?? [])
  const [featured, setFeatured] = useState(editing?.featured ?? false)
  const [tried, setTried] = useState(false)
  const [id] = useState(() => editing?.id ?? newId('col'))

  const finalSlug = slug ?? slugify(name)
  const tags = useMemo(
    () =>
      [...new Set([...s.products.flatMap((p) => p.tags), ...ruleTags])].sort((a, b) => a.localeCompare(b)),
    [s.products, ruleTags],
  )

  const draft: Collection = {
    id,
    tenantId: s.tenantId,
    name: name.trim(),
    slug: finalSlug,
    description: description.trim(),
    mode,
    productIds: mode === 'manual' ? productIds : [],
    ruleCategoryIds: mode === 'smart' ? ruleCategoryIds : [],
    ruleTags: mode === 'smart' ? ruleTags : [],
    featured,
  }
  const matches = collectionProducts(draft, s.products, s.categories)

  const nameTaken = s.collections.some(
    (c) => c.id !== editing?.id && c.name.trim().toLowerCase() === name.trim().toLowerCase(),
  )
  const slugOwner = s.collections.find((c) => c.id !== editing?.id && c.slug === finalSlug)
  const errors = {
    name: !name.trim()
      ? 'Enter a name shoppers will see.'
      : nameTaken
        ? 'Another collection already has this name.'
        : null,
    slug: !finalSlug
      ? 'Enter a slug for the collection link.'
      : !SLUG.test(finalSlug)
        ? 'Use lowercase letters, digits and single hyphens in the slug.'
        : slugOwner
          ? `${slugOwner.name} already uses /${finalSlug}. Choose another slug.`
          : null,
    rules:
      mode === 'manual'
        ? productIds.length
          ? null
          : 'Choose at least one product.'
        : ruleCategoryIds.length || ruleTags.length
          ? null
          : 'Add a category or a tag so the collection can fill itself.',
  }
  const show = (message: string | null) => (tried ? (message ?? undefined) : undefined)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (Object.values(errors).some(Boolean)) return
    s.dispatch({ type: 'collections/save', collection: draft })
    onDone(draft)
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${editing.name}` : 'New collection'}</DialogTitle>
        <DialogDescription>
          A manual collection lists the products you pick. A smart one fills itself with active products that
          match its categories or tags.
        </DialogDescription>
      </DialogHeader>
      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        <FormField label="Name" required error={show(errors.name)} htmlFor="col-name">
          <Input
            id="col-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Trail season"
          />
        </FormField>
        <FormField
          label="Slug"
          required
          error={show(errors.slug)}
          hint={`Shoppers open it at /collections/${finalSlug || 'slug'}.`}
          htmlFor="col-slug"
        >
          <Input
            id="col-slug"
            inputClassName="font-mono"
            value={finalSlug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
            placeholder="trail-season"
          />
        </FormField>
        <FormField
          label="Description"
          hint="Optional. Shown under the title on the collection page."
          htmlFor="col-desc"
          className="sm:col-span-2"
        >
          <Textarea
            id="col-desc"
            className="min-h-20"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <FormField label="Products come from" className="sm:col-span-2">
          <SegmentedControl
            className="sm:w-auto w-full"
            aria-label="Collection mode"
            value={mode}
            onChange={(v) => setMode(v as CollectionMode)}
            options={MODES}
          />
        </FormField>
        {mode === 'manual' ? (
          <FormField
            label="Products"
            required
            error={show(errors.rules)}
            hint="Shown in the order you pick them."
            htmlFor="col-products"
            className="sm:col-span-2"
          >
            <ProductsPicker
              id="col-products"
              invalid={!!show(errors.rules)}
              values={productIds}
              onChange={setProductIds}
            />
          </FormField>
        ) : (
          <>
            <FormField
              label="Categories"
              hint="Sub-categories count too."
              error={show(errors.rules)}
              htmlFor="col-categories"
            >
              <CategoriesPicker
                id="col-categories"
                placeholder="No category"
                invalid={!!show(errors.rules)}
                values={ruleCategoryIds}
                onChange={setRuleCategoryIds}
              />
            </FormField>
            <FormField label="Tags" hint="A product with any of these tags joins." htmlFor="col-tags">
              <MultiCombobox
                id="col-tags"
                items={tags}
                values={ruleTags}
                onChange={setRuleTags}
                getKey={(t) => t}
                getLabel={(t) => t}
                getDescription={(t) => plural(s.products.filter((p) => p.tags.includes(t)).length, 'product')}
                placeholder="No tag"
                searchPlaceholder="Search tags"
                createLabel={(q) => `Add tag "${q.trim()}"`}
                onCreate={(q) => {
                  const tag = q.trim().toLowerCase()
                  if (tag && !ruleTags.includes(tag)) setRuleTags([...ruleTags, tag])
                }}
              />
            </FormField>
          </>
        )}

        <div className="rounded-2xl p-3 text-sm sm:col-span-2 bg-surface-2" aria-live="polite">
          <p className="font-medium">
            {matches.length
              ? `${plural(matches.length, 'product')} in this collection`
              : 'No products match yet'}
          </p>
          {matches.length > 0 && (
            <p className="mt-0.5 text-xs text-muted">
              {matches
                .slice(0, 6)
                .map((p) => p.name)
                .join(', ')}
              {matches.length > 6 && `, and ${matches.length - 6} more`}
            </p>
          )}
        </div>

        <label className="gap-3 rounded-2xl p-3 sm:col-span-2 flex items-center justify-between bg-surface-2">
          <span className="min-w-0">
            <span className="text-sm font-medium block">Featured on the storefront</span>
            <span className="text-xs block text-muted">Shown as a tile on the homepage.</span>
          </span>
          <Switch checked={featured} onCheckedChange={setFeatured} aria-label="Featured on the storefront" />
        </label>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save collection' : 'Create collection'}</Button>
      </DialogFooter>
    </form>
  )
}
