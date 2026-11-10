import { isExternalHref } from '@rc/fixtures'
import type { PageSection, PageSectionItem } from '@rc/types'
import { Badge, Button, Combobox, FormField, Input, Textarea } from '@rc/ui'
import { PackagePlus, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ImageUpload } from '../../components/ImageUpload'
import { ProductsPicker } from '../../components/pickers'
import { useScoped } from '../../state/scoped'
import { type Field, type ItemWords, SECTION_COPY, SECTION_FORM } from './lib'
import type { Change } from './SectionList'

/** The selected section's content in plain words: title, text, button, image, products or items. */
export function SectionForm({
  section,
  change,
  onAddProduct,
}: {
  section: PageSection
  change: Change
  onAddProduct: () => void
}) {
  const { tenantId, products } = useScoped()
  const { label, icon: Icon } = SECTION_COPY[section.kind]
  const form = SECTION_FORM[section.kind]
  const has = (field: Field) => form.fields.includes(field)
  const set = (patch: Partial<PageSection>, field: string) =>
    change(
      (d) => ({ ...d, sections: d.sections.map((x) => (x.id === section.id ? { ...x, ...patch } : x)) }),
      `Changed ${label}`,
      `${section.id}:${field}`,
    )
  const id = (field: string) => `${section.id}-${field}`

  return (
    <div className="space-y-4">
      <div className="gap-3 flex items-center">
        <span className="size-10 rounded-xl flex shrink-0 items-center justify-center bg-surface">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold truncate">{label}</h2>
          {section.rule !== 'optional' && <Badge variant="muted">Your layout needs it</Badge>}
        </div>
      </div>
      {form.note && <p className="text-sm text-muted">{form.note}</p>}

      {has('headline') && (
        <FormField label={form.headline ?? 'Title'} htmlFor={id('headline')}>
          <Input
            id={id('headline')}
            variant="soft"
            value={section.headline}
            onChange={(e) => set({ headline: e.target.value }, 'headline')}
          />
        </FormField>
      )}
      {has('body') && (
        <FormField label={form.body ?? 'Text'} htmlFor={id('body')}>
          <Textarea
            id={id('body')}
            variant="soft"
            rows={3}
            value={section.body}
            onChange={(e) => set({ body: e.target.value }, 'body')}
          />
        </FormField>
      )}
      {has('button') && (
        <>
          <FormField label="Button text" htmlFor={id('cta')}>
            <Input
              id={id('cta')}
              variant="soft"
              value={section.ctaLabel}
              placeholder="Shop now"
              onChange={(e) => set({ ctaLabel: e.target.value }, 'cta')}
            />
          </FormField>
          <LinkField
            id={id('href')}
            value={section.ctaHref}
            onChange={(ctaHref) => set({ ctaHref }, 'href')}
          />
        </>
      )}
      {has('image') && (
        <FormField label="Image" htmlFor={id('image')} hint="Without one, the layout's own photo shows.">
          <ImageUpload
            id={id('image')}
            tenantId={tenantId}
            label={`${label} image`}
            value={section.imageUrl || undefined}
            onChange={(imageUrl) => set({ imageUrl }, 'image')}
          />
        </FormField>
      )}
      {has('products') && (
        <FormField label="Products" htmlFor={id('products')}>
          {products.length ? (
            <ProductsPicker
              id={id('products')}
              variant="soft"
              values={section.productIds}
              onChange={(productIds) => set({ productIds }, 'products')}
            />
          ) : (
            <p className="text-sm text-muted">You have no products yet.</p>
          )}
          <Button variant="ghost" size="sm" className="mt-2" onClick={onAddProduct}>
            <PackagePlus />
            Add a product
          </Button>
        </FormField>
      )}
      {has('items') && form.items && (
        <ItemsField
          sectionId={section.id}
          items={section.items ?? []}
          words={form.items}
          onChange={(items, field) => set({ items }, field)}
        />
      )}
    </div>
  )
}

const CUSTOM = 'custom'

/** "Button goes to": a store page, product, collection or category, or any web address. */
function LinkField({
  id,
  value,
  onChange,
}: {
  id: string
  value: string | undefined
  onChange: (href: string | undefined) => void
}) {
  const { pages, products, collections, categories } = useScoped()
  const [custom, setCustom] = useState(value && isExternalHref(value) ? value : null)
  const targets = useMemo(
    () => [
      { key: '/', label: 'Home page', note: 'Page' },
      { key: '/search', label: 'All products', note: 'Page' },
      ...pages
        .filter((p) => !p.sellerId && p.kind !== 'home' && p.kind !== 'personal')
        .map((p) => ({
          key: p.slug,
          label: p.title,
          note: p.status === 'published' ? 'Page' : 'Page, not published yet',
        })),
      ...collections.map((c) => ({ key: `/collections/${c.slug}`, label: c.name, note: 'Collection' })),
      ...categories.map((c) => ({ key: `/c/${c.id}`, label: c.name, note: 'Category' })),
      ...products
        .filter((p) => p.status === 'active')
        .map((p) => ({ key: `/p/${p.id}`, label: p.name, note: 'Product' })),
      { key: CUSTOM, label: 'A web address', note: 'Such as your WhatsApp or Instagram link' },
    ],
    [pages, products, collections, categories],
  )
  const invalid = custom !== null && custom.trim() !== '' && !isExternalHref(custom.trim())

  return (
    <>
      <FormField
        label="Button goes to"
        htmlFor={id}
        hint={value ? undefined : 'Without a choice, the button opens your products.'}
      >
        <Combobox
          id={id}
          variant="soft"
          clearable
          items={targets}
          value={custom !== null ? CUSTOM : (value ?? null)}
          onChange={(key) => {
            if (key === CUSTOM) return setCustom(value && isExternalHref(value) ? value : '')
            setCustom(null)
            onChange(key ?? undefined)
          }}
          getKey={(t) => t.key}
          getLabel={(t) => t.label}
          getDescription={(t) => t.note}
          placeholder="Choose where it goes"
          searchPlaceholder="Search pages, products and collections"
        />
      </FormField>
      {custom !== null && (
        <FormField
          label="Web address"
          htmlFor={`${id}-url`}
          error={invalid ? 'Start the address with https://' : undefined}
        >
          <Input
            id={`${id}-url`}
            variant="soft"
            inputMode="url"
            value={custom}
            placeholder="https://wa.me/628123456789"
            onChange={(e) => {
              setCustom(e.target.value)
              const url = e.target.value.trim()
              if (isExternalHref(url)) onChange(url)
            }}
          />
        </FormField>
      )}
    </>
  )
}

/** A list of question and answer pairs, or quotes and their authors. */
function ItemsField({
  sectionId,
  items,
  words,
  onChange,
}: {
  sectionId: string
  items: PageSectionItem[]
  words: ItemWords
  onChange: (items: PageSectionItem[], field: string) => void
}) {
  const edit = (i: number, patch: Partial<PageSectionItem>, field: string) =>
    onChange(
      items.map((item, j) => (j === i ? { ...item, ...patch } : item)),
      `items:${i}:${field}`,
    )
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-medium">{words.heading}</legend>
      {items.map((item, i) => (
        <div key={i} className="space-y-2 p-3 rounded-2xl bg-surface">
          <div className="gap-2 flex items-start">
            <FormField label={words.title} htmlFor={`${sectionId}-item-${i}`} className="min-w-0 flex-1">
              <Input
                id={`${sectionId}-item-${i}`}
                value={item.title}
                onChange={(e) => edit(i, { title: e.target.value }, 'title')}
              />
            </FormField>
            <Button
              variant="ghost"
              size="icon-sm"
              className="mt-6"
              aria-label={`Remove ${words.title.toLowerCase()} ${i + 1}`}
              onClick={() =>
                onChange(
                  items.filter((_, j) => j !== i),
                  `items:${i}:remove`,
                )
              }
            >
              <Trash2 />
            </Button>
          </div>
          <FormField label={words.body} htmlFor={`${sectionId}-item-${i}-body`}>
            <Textarea
              id={`${sectionId}-item-${i}-body`}
              rows={2}
              value={item.body}
              onChange={(e) => edit(i, { body: e.target.value }, 'body')}
            />
          </FormField>
        </div>
      ))}
      <Button
        variant="soft"
        size="sm"
        onClick={() => onChange([...items, { title: '', body: '' }], `items:${items.length}:add`)}
      >
        <Plus />
        {words.add}
      </Button>
    </fieldset>
  )
}
