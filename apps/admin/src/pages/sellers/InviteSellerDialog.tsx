import { newId, nextCode, nowIso, slugify } from '@rc/fixtures'
import { SELLER_KIND_LABEL, type Seller, type SellerKind } from '@rc/types'
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
  NativeSelect,
} from '@rc/ui'
import { type FormEvent, useMemo, useState } from 'react'
import { TemplatePicker } from '../../components/pickers'
import { useScoped } from '../../state/scoped'
import { SELLER_CODE_PREFIX, storeHost, uniqueSlug } from './lib'

const KIND_OPTIONS = (Object.keys(SELLER_KIND_LABEL) as SellerKind[]).map((k) => ({
  value: k,
  label: SELLER_KIND_LABEL[k],
}))
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const PHONE = /^\+?[\d\s-]{8,}$/

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onSaved: (seller: Seller) => void }

export function InviteSellerDialog({ open, onOpenChange, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {open && (
          <InviteForm
            onDone={(seller) => {
              onOpenChange(false)
              if (seller) onSaved(seller)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function InviteForm({ onDone }: { onDone: (seller: Seller | null) => void }) {
  const s = useScoped()
  const personal = useMemo(() => s.templates.filter((t) => t.scope === 'personal'), [s.templates])
  const taken = useMemo(() => new Set(s.sellers.map((x) => x.slug)), [s.sellers])
  const [draft, setDraft] = useState(() => ({
    name: '',
    kind: 'sales' as SellerKind,
    city: '',
    whatsapp: '',
    slug: '',
    slugEdited: false,
    commission: '5',
    allowed: personal.map((t) => t.id),
    templateId: (personal[0]?.id ?? null) as string | null,
  }))
  const [tried, setTried] = useState(false)
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }))

  const slug = draft.slugEdited ? draft.slug : uniqueSlug(slugify(draft.name), taken)
  const commission = Number(draft.commission)
  const errors = {
    name: draft.name.trim() ? undefined : 'Enter the seller’s full name.',
    city: draft.city.trim() ? undefined : 'Enter the city the seller works from.',
    whatsapp: PHONE.test(draft.whatsapp.trim())
      ? undefined
      : 'Enter a WhatsApp number such as +62 812 1000 2001.',
    slug: !slug
      ? 'Enter the store address.'
      : !SLUG.test(slug)
        ? 'Use lowercase letters, digits and single hyphens.'
        : taken.has(slug)
          ? `Another seller already uses ${storeHost(s.tenant)}/${slug}.`
          : undefined,
    commission:
      draft.commission !== '' && Number.isFinite(commission) && commission >= 0 && commission <= 50
        ? undefined
        : 'Enter a commission between 0 and 50 percent.',
    allowed: draft.allowed.length ? undefined : 'Allow at least one template.',
    templateId:
      draft.templateId && draft.allowed.includes(draft.templateId)
        ? undefined
        : 'Choose a starting template from the allowed ones.',
  }
  const show = (error: string | undefined) => (tried ? error : undefined)

  const setAllowed = (allowed: string[]) =>
    set({
      allowed,
      templateId:
        draft.templateId && allowed.includes(draft.templateId) ? draft.templateId : (allowed[0] ?? null),
    })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!draft.templateId || Object.values(errors).some(Boolean)) return
    const colors = [...new Set(s.state.sellers.map((x) => x.color))]
    const seller: Seller = {
      id: newId('sel'),
      tenantId: s.tenantId,
      userId: null,
      code: nextCode(
        s.sellers.map((x) => x.code),
        SELLER_CODE_PREFIX[draft.kind],
        3,
      ),
      name: draft.name.trim(),
      kind: draft.kind,
      slug,
      status: 'invited',
      city: draft.city.trim(),
      bio: '',
      headline: '',
      whatsapp: draft.whatsapp.trim(),
      instagram: null,
      templateId: draft.templateId,
      allowedTemplateIds: draft.allowed,
      featuredProductIds: [],
      commissionRate: commission / 100,
      joinedAt: nowIso(),
      color: colors[s.sellers.length % Math.max(1, colors.length)] ?? s.user.color,
    }
    s.dispatch({ type: 'sellers/save', seller })
    onDone(seller)
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Invite seller</DialogTitle>
        <DialogDescription>
          They get a WhatsApp link to set up their personal store. Orders from the store, or from any link
          with their ref code, count for them.
        </DialogDescription>
      </DialogHeader>
      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        <FormField label="Full name" required htmlFor="sel-name" error={show(errors.name)}>
          <Input
            id="sel-name"
            autoFocus
            value={draft.name}
            placeholder="Fahmi Rahman"
            onChange={(e) => set({ name: e.target.value })}
          />
        </FormField>
        <FormField label="Kind" htmlFor="sel-kind">
          <NativeSelect
            id="sel-kind"
            options={KIND_OPTIONS}
            value={draft.kind}
            onChange={(e) => set({ kind: e.target.value as SellerKind })}
          />
        </FormField>
        <FormField label="City" required htmlFor="sel-city" error={show(errors.city)}>
          <Input
            id="sel-city"
            value={draft.city}
            placeholder="Jakarta"
            onChange={(e) => set({ city: e.target.value })}
          />
        </FormField>
        <FormField
          label="WhatsApp"
          required
          htmlFor="sel-wa"
          error={show(errors.whatsapp)}
          hint="The invite goes to this number."
        >
          <Input
            id="sel-wa"
            type="tel"
            value={draft.whatsapp}
            placeholder="+62 812 1000 2001"
            onChange={(e) => set({ whatsapp: e.target.value })}
          />
        </FormField>
        <FormField
          label="Store address"
          required
          htmlFor="sel-slug"
          error={show(errors.slug)}
          hint={`${storeHost(s.tenant)}/${slug || 'name'} · also the ?ref= code`}
        >
          <Input
            id="sel-slug"
            inputClassName="font-mono"
            value={slug}
            onChange={(e) =>
              set({ slug: e.target.value.toLowerCase().replace(/\s+/g, '-'), slugEdited: true })
            }
          />
        </FormField>
        <FormField
          label="Commission (%)"
          required
          htmlFor="sel-commission"
          error={show(errors.commission)}
          hint="Of revenue from orders attributed to them."
        >
          <Input
            id="sel-commission"
            inputMode="decimal"
            inputClassName="tabular-nums"
            value={draft.commission}
            onChange={(e) => set({ commission: e.target.value.replace(/[^\d.]/g, '') })}
          />
        </FormField>
        <FormField
          label="Allowed templates"
          required
          htmlFor="sel-allowed"
          error={show(errors.allowed)}
          hint="The seller can switch between these. Content stays the same."
          className="sm:col-span-2"
        >
          <MultiCombobox
            id="sel-allowed"
            items={personal}
            values={draft.allowed}
            onChange={setAllowed}
            placeholder="Choose templates"
            searchPlaceholder="Search templates"
            getKey={(t) => t.id}
            getLabel={(t) => t.name}
            getDescription={(t) => t.bestFor}
          />
        </FormField>
        <FormField
          label="Starting template"
          required
          htmlFor="sel-template"
          error={show(errors.templateId)}
          className="sm:col-span-2"
        >
          <TemplatePicker
            id="sel-template"
            scope="personal"
            allowedIds={draft.allowed}
            value={draft.templateId}
            onChange={(templateId) => set({ templateId })}
          />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">Send invite</Button>
      </DialogFooter>
    </form>
  )
}
