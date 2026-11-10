import type { PageSection, SectionKind } from '@rc/types'
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Tooltip,
  cn,
} from '@rc/ui'
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  type LucideIcon,
  PackagePlus,
  Plus,
  Trash2,
} from 'lucide-react'
import { Fragment, type KeyboardEvent, type PointerEvent, type ReactNode, useRef, useState } from 'react'
import { useScoped } from '../../state/scoped'
import { ADDABLE, SECTION_COPY, insertSection, moveSection, newSection, sectionLocks } from './lib'
import type { Draft } from './useDraft'

export type Change = (next: (d: Draft) => Draft, label: string, key?: string) => void

/** The page's sections, top to bottom: pick one, add, move, show or hide, and delete. */
export function SectionList({
  sections,
  selected,
  onSelect,
  change,
  onAddProduct,
  footer,
}: {
  sections: PageSection[]
  selected: string | null
  onSelect: (id: string) => void
  change: Change
  onAddProduct: () => void
  footer: ReactNode
}) {
  const { tenant } = useScoped()
  const listed = sections.filter((s) => s.kind !== 'footer')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<PageSection | null>(null)
  const [drag, setDrag] = useState<{ id: string; to: number } | null>(null)
  const rows = useRef(new Map<string, HTMLLIElement>())

  const label = (s: PageSection) => SECTION_COPY[s.kind].label
  const move = (s: PageSection, to: number) =>
    change((d) => ({ ...d, sections: moveSection(d.sections, s.id, to) }), `Moved ${label(s)}`)
  const add = (kind: SectionKind) => {
    const section = newSection(kind, tenant)
    change(
      (d) => ({ ...d, sections: insertSection(d.sections, section, selected) }),
      `Added ${SECTION_COPY[kind].label}`,
    )
    setAdding(false)
    onSelect(section.id)
  }

  // Dragging by the handle: the drop place is how many other rows sit above the pointer.
  const dropIndex = (id: string, y: number) =>
    listed.filter((s) => {
      const el = rows.current.get(s.id)
      if (s.id === id || !el) return false
      const box = el.getBoundingClientRect()
      return box.top + box.height / 2 < y
    }).length
  const onPointerDown = (s: PageSection, e: PointerEvent<HTMLButtonElement>) => {
    if (sectionLocks(s).move) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ id: s.id, to: listed.indexOf(s) })
  }
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (drag) setDrag({ id: drag.id, to: dropIndex(drag.id, e.clientY) })
  }
  const onPointerUp = (s: PageSection) => {
    if (drag && drag.to !== listed.indexOf(s)) move(s, drag.to)
    setDrag(null)
  }
  const onHandleKey = (s: PageSection, i: number, e: KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    move(s, i + (e.key === 'ArrowUp' ? -1 : 1))
  }
  const others = drag ? listed.filter((s) => s.id !== drag.id) : []
  const dropLine = <li aria-hidden="true" className="h-0.5 mx-2 rounded-full bg-accent" />

  return (
    <div className="space-y-4">
      <div className="gap-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Sections</h2>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus />
          Add section
        </Button>
      </div>

      <ol className="space-y-1">
        {listed.map((s, i) => {
          const locks = sectionLocks(s)
          const Icon = SECTION_COPY[s.kind].icon
          const active = s.id === selected
          return (
            <Fragment key={s.id}>
              {drag && others[drag.to]?.id === s.id && dropLine}
              <li
                ref={(el) => {
                  if (el) rows.current.set(s.id, el)
                  else rows.current.delete(s.id)
                }}
                className={cn(
                  'gap-1 p-1 rounded-2xl flex items-center',
                  active ? 'bg-surface-2' : 'hover:bg-surface',
                  drag?.id === s.id && 'opacity-60 ring-2 ring-accent',
                )}
              >
                <Tooltip content={locks.move ?? 'Drag, or use the arrow keys, to move'}>
                  <button
                    type="button"
                    aria-label={`Move ${label(s)}`}
                    aria-disabled={!!locks.move}
                    onPointerDown={(e) => onPointerDown(s, e)}
                    onPointerMove={onPointerMove}
                    onPointerUp={() => onPointerUp(s)}
                    onPointerCancel={() => setDrag(null)}
                    onKeyDown={(e) => !locks.move && onHandleKey(s, i, e)}
                    className={cn(
                      'h-9 w-6 rounded-lg flex shrink-0 touch-none items-center justify-center text-muted',
                      locks.move ? 'cursor-not-allowed opacity-40' : 'cursor-grab hover:text-foreground',
                    )}
                  >
                    <GripVertical className="size-4" aria-hidden="true" />
                  </button>
                </Tooltip>
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  aria-current={active || undefined}
                  className={cn(
                    'min-w-0 gap-2 py-1 flex flex-1 items-center text-left',
                    s.hidden && 'opacity-50',
                  )}
                >
                  <span className="size-8 rounded-xl flex shrink-0 items-center justify-center bg-card">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="text-sm font-medium block truncate">{label(s)}</span>
                    <span className="text-xs block truncate text-muted">
                      {s.hidden ? 'Hidden' : s.headline.trim() || 'No title yet'}
                    </span>
                  </span>
                </button>
                <RowAction
                  icon={ArrowUp}
                  label={`Move ${label(s)} up`}
                  reason={locks.move ?? (i === 0 ? 'Already at the top' : null)}
                  onClick={() => move(s, i - 1)}
                />
                <RowAction
                  icon={ArrowDown}
                  label={`Move ${label(s)} down`}
                  reason={locks.move ?? (i === listed.length - 1 ? 'Already at the bottom' : null)}
                  onClick={() => move(s, i + 1)}
                />
                <RowAction
                  icon={s.hidden ? EyeOff : Eye}
                  label={s.hidden ? `Show ${label(s)}` : `Hide ${label(s)}`}
                  reason={s.hidden ? null : locks.hide}
                  onClick={() =>
                    change(
                      (d) => ({
                        ...d,
                        sections: d.sections.map((x) => (x.id === s.id ? { ...x, hidden: !x.hidden } : x)),
                      }),
                      `${s.hidden ? 'Showed' : 'Hid'} ${label(s)}`,
                    )
                  }
                />
                <RowAction
                  icon={Trash2}
                  label={`Delete ${label(s)}`}
                  reason={locks.remove}
                  onClick={() => setRemoving(s)}
                />
              </li>
            </Fragment>
          )
        })}
        {drag && drag.to >= others.length && dropLine}
      </ol>

      <Button variant="soft" size="sm" className="w-full" onClick={onAddProduct}>
        <PackagePlus />
        Add a product
      </Button>

      {footer}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Add a section</DialogTitle>
            <DialogDescription>
              It goes below the section you picked. You can move it after.
            </DialogDescription>
          </DialogHeader>
          <ul className="gap-2 sm:grid-cols-2 grid grid-cols-1">
            {ADDABLE.map((kind) => {
              const { label: name, icon: Icon, blurb } = SECTION_COPY[kind]
              return (
                <li key={kind}>
                  <button
                    type="button"
                    onClick={() => add(kind)}
                    className="gap-3 p-3 rounded-2xl flex h-full w-full items-start bg-surface text-left hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
                  >
                    <span className="size-10 rounded-xl flex shrink-0 items-center justify-center bg-card">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="text-sm font-semibold block">{name}</span>
                      <span className="text-xs block text-muted">{blurb}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        destructive
        title={removing ? `Delete ${label(removing)}?` : ''}
        description="It comes off the page. Undo brings it back while the editor is open."
        confirmLabel="Delete section"
        onConfirm={() => {
          if (!removing) return
          change(
            (d) => ({ ...d, sections: d.sections.filter((x) => x.id !== removing.id) }),
            `Deleted ${label(removing)}`,
          )
          setRemoving(null)
        }}
      />
    </div>
  )
}

/** A small row button. With a reason it stays focusable but does nothing, and the tooltip says why. */
function RowAction({
  icon: Icon,
  label,
  reason,
  onClick,
}: {
  icon: LucideIcon
  label: string
  reason: string | null
  onClick: () => void
}) {
  return (
    <Tooltip content={reason ?? label}>
      <button
        type="button"
        aria-label={label}
        aria-disabled={!!reason}
        onClick={() => !reason && onClick()}
        className={cn(
          'size-7 rounded-lg flex shrink-0 items-center justify-center text-muted',
          reason ? 'cursor-not-allowed opacity-35' : 'hover:bg-card hover:text-foreground',
        )}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </button>
    </Tooltip>
  )
}
