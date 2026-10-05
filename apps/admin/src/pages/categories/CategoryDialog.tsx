import { newId } from '@rc/fixtures'
import type { Category } from '@rc/types'
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
  Textarea,
} from '@rc/ui'
import { type FormEvent, useState } from 'react'
import { CategoryPicker } from '../../components/pickers'
import { useScoped } from '../../state/scoped'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Category | null
  onSaved: (c: Category) => void
}

export function CategoryDialog({ open, onOpenChange, editing, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        {open && (
          <CategoryForm
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

function CategoryForm({
  editing,
  onDone,
}: {
  editing: Category | null
  onDone: (saved: Category | null) => void
}) {
  const s = useScoped()
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [parentId, setParentId] = useState<string | null>(editing?.parentId ?? null)
  const [tried, setTried] = useState(false)
  const hasChildren = !!editing && s.categories.some((c) => c.parentId === editing.id)
  const taken = s.categories.some(
    (c) => c.id !== editing?.id && c.name.trim().toLowerCase() === name.trim().toLowerCase(),
  )
  const errors = {
    name: !name.trim() ? 'Enter a name.' : taken ? 'Another category already has this name.' : null,
  }
  const show = (message: string | null) => (tried ? (message ?? undefined) : undefined)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (errors.name) return
    const category: Category = {
      id: editing?.id ?? newId('cat'),
      tenantId: s.tenantId,
      name: name.trim(),
      description: description.trim(),
      parentId,
    }
    s.dispatch({ type: 'categories/save', category })
    onDone(category)
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${editing.name}` : 'New category'}</DialogTitle>
        <DialogDescription>
          Products sit in exactly one category. A sub-category inherits the attributes of its parent.
        </DialogDescription>
      </DialogHeader>
      <div className="gap-4 grid grid-cols-1">
        <FormField label="Name" required error={show(errors.name)} htmlFor="cat-name">
          <Input
            id="cat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Trail shoes"
          />
        </FormField>
        <FormField
          label="Parent"
          htmlFor="cat-parent"
          hint={
            hasChildren
              ? 'It has sub-categories, so it stays at the top level.'
              : 'Optional. Leave empty for a top-level category.'
          }
        >
          <CategoryPicker
            id="cat-parent"
            topLevelOnly
            excludeId={editing?.id}
            clearable
            disabled={hasChildren}
            value={parentId}
            onChange={setParentId}
            placeholder="Top level"
          />
        </FormField>
        <FormField
          label="Description"
          hint="Optional. Shoppers see it on the category page."
          htmlFor="cat-desc"
        >
          <Textarea
            id="cat-desc"
            className="min-h-20"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save category' : 'Create category'}</Button>
      </DialogFooter>
    </form>
  )
}
