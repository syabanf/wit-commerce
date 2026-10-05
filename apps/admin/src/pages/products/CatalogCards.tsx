import { attributeValueError, attributesFor, formatAttribute, plural } from '@rc/fixtures'
import type { AttributeDef, Product } from '@rc/types'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FormField,
  Input,
  NativeSelect,
  SegmentedControl,
  toast,
} from '@rc/ui'
import { Pencil } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/auth'
import { useScoped } from '../../state/scoped'
import { priceDelta, selectionRule } from '../modifiers/lib'

/** Attribute values of a product, with the definitions its category brings. */
export function AttributesCard({ product }: { product: Product }) {
  const s = useScoped()
  const { can } = useAuth()
  const [editing, setEditing] = useState(false)
  const defs = attributesFor(product.categoryId, s.attributes, s.categories)
  const missing = defs.filter((d) => d.required && !product.attributes[d.id]?.trim()).length

  return (
    <Card>
      <CardHeader
        action={
          can('product.manage') && defs.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil />
              Edit attributes
            </Button>
          ) : undefined
        }
      >
        <CardTitle className="gap-2 flex items-center">
          Attributes{' '}
          {missing > 0 && <Badge variant="warning">{plural(missing, 'required value')} missing</Badge>}
        </CardTitle>
        <p className="text-xs text-muted">
          From {s.categoryName(product.categoryId)} and its parent category.
        </p>
      </CardHeader>
      <CardContent>
        {defs.length === 0 ? (
          <EmptyState
            compact
            title="No attributes for this category"
            description="Attributes you scope to this category show up here."
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/commerce/attributes">Open attributes</Link>
              </Button>
            }
          />
        ) : (
          <dl className="gap-2 sm:grid-cols-2 grid grid-cols-1">
            {defs.map((d) => {
              const value = product.attributes[d.id]
              const gap = d.required && !value?.trim()
              return (
                <div key={d.id} className="rounded-2xl px-3 py-2.5 bg-surface-2">
                  <dt className="text-xs text-muted">
                    {d.name}
                    {d.filterable && <span className="text-silver"> · filter</span>}
                  </dt>
                  <dd
                    className={
                      gap
                        ? 'mt-0.5 text-sm font-semibold text-warning'
                        : value
                          ? 'mt-0.5 text-sm font-semibold'
                          : 'mt-0.5 text-sm text-muted'
                    }
                  >
                    {gap ? 'Required, not set' : formatAttribute(d, value)}
                  </dd>
                </div>
              )
            })}
          </dl>
        )}
      </CardContent>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent size="lg">
          {editing && <AttributesForm product={product} defs={defs} onDone={() => setEditing(false)} />}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function AttributesForm({
  product,
  defs,
  onDone,
}: {
  product: Product
  defs: AttributeDef[]
  onDone: () => void
}) {
  const { dispatch } = useScoped()
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(defs.map((d) => [d.id, product.attributes[d.id] ?? ''])),
  )
  const [tried, setTried] = useState(false)
  const errors = Object.fromEntries(defs.map((d) => [d.id, attributeValueError(d, values[d.id] ?? '')]))
  const set = (id: string, value: string) => setValues((v) => ({ ...v, [id]: value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (Object.values(errors).some(Boolean)) return
    // Values of attributes outside this category stay untouched.
    const next = { ...product.attributes }
    for (const d of defs) {
      const v = values[d.id]?.trim()
      if (v) next[d.id] = v
      else delete next[d.id]
    }
    dispatch({ type: 'products/setAttributes', id: product.id, attributes: next })
    toast('Attributes saved', {
      tone: 'success',
      description: `${product.code} · ${plural(Object.keys(next).length, 'value')}`,
    })
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Attributes of {product.name}</DialogTitle>
        <DialogDescription>
          Required attributes must be filled before the product goes live. Filterable ones power storefront
          filters.
        </DialogDescription>
      </DialogHeader>
      <div className="gap-4 sm:grid-cols-2 grid grid-cols-1">
        {defs.map((d) => {
          const id = `attr-${d.id}`
          const error = tried ? (errors[d.id] ?? undefined) : undefined
          return (
            <FormField
              key={d.id}
              label={d.name}
              required={d.required}
              error={error}
              htmlFor={id}
              hint={d.unit ? `In ${d.unit}` : undefined}
            >
              {d.type === 'select' ? (
                <NativeSelect
                  id={id}
                  placeholder="Choose"
                  value={values[d.id] ?? ''}
                  onChange={(e) => set(d.id, e.target.value)}
                  options={d.options.map((o) => ({ value: o, label: o }))}
                />
              ) : d.type === 'boolean' ? (
                <SegmentedControl
                  className="w-full"
                  value={values[d.id] || null}
                  onChange={(v) => set(d.id, v)}
                  options={[
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' },
                  ]}
                />
              ) : (
                <Input
                  id={id}
                  inputMode={d.type === 'number' ? 'decimal' : undefined}
                  value={values[d.id] ?? ''}
                  onChange={(e) => set(d.id, e.target.value)}
                />
              )}
            </FormField>
          )
        })}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Save attributes</Button>
      </DialogFooter>
    </form>
  )
}

/** Modifier groups shoppers see with this product at checkout. */
export function ModifiersCard({ product }: { product: Product }) {
  const s = useScoped()
  const groups = s.modifiers.filter((g) => g.productIds.includes(product.id))
  return (
    <Card>
      <CardHeader
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/commerce/modifiers">Manage</Link>
          </Button>
        }
      >
        <CardTitle>Modifiers</CardTitle>
        <p className="text-xs text-muted">Add-on choices at checkout.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {groups.length === 0 ? (
          <EmptyState
            compact
            title="No modifiers"
            description="Attach a group such as gift wrap from the modifiers page."
          />
        ) : (
          groups.map((g) => (
            <div key={g.id} className="rounded-2xl p-3 bg-surface-2">
              <p className="gap-x-2 text-sm flex flex-wrap items-baseline justify-between">
                <span className="font-semibold">{g.name}</span>
                <span className="text-xs text-muted">{selectionRule(g)}</span>
              </p>
              <ul className="mt-1.5 space-y-1 text-xs">
                {g.options.map((o) => (
                  <li key={o.id} className="gap-2 flex justify-between">
                    <span className="min-w-0 truncate">{o.name}</span>
                    <span className="shrink-0 text-muted tabular-nums">{priceDelta(o.priceDelta)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
