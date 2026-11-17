import {
  FOOTER_LINKS_MAX,
  HEADER_LINKS_MAX,
  MENU_LABEL_MAX,
  cleanMenus,
  isMenuPage,
  menusBlocker,
  validLink,
} from '@rc/fixtures'
import { type MenuLink, type MenuTarget, PAGE_STATUS_LABEL } from '@rc/types'
import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  PillTabs,
  Tooltip,
  cn,
  toast,
} from '@rc/ui'
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react'
import { Fragment, useRef, useState } from 'react'
import { usePointerReorder } from '../../hooks/usePointerReorder'
import { useScoped } from '../../state/scoped'
import { RowAction } from './SectionList'

type Which = 'header' | 'footer'
interface Row extends MenuLink {
  key: number
}
interface Option {
  key: string
  label: string
  description: string
  target: MenuTarget
}

const LIMIT: Record<Which, number> = { header: HEADER_LINKS_MAX, footer: FOOTER_LINKS_MAX }
const targetKey = (t: MenuTarget) => (t.kind === 'catalog' || t.kind === 'url' ? t.kind : `${t.kind}:${t.id}`)

/** The store's header and footer links: add, rename, reorder, remove. A save goes live at once. */
export function MenusDialog({ onClose }: { onClose: () => void }) {
  const s = useScoped()
  const next = useRef(0)
  const toRows = (links: MenuLink[] | undefined) => (links ?? []).map((l) => ({ ...l, key: next.current++ }))
  const [rows, setRows] = useState<Record<Which, Row[]>>(() => ({
    header: toRows(s.tenant.menus?.header),
    footer: toRows(s.tenant.menus?.footer),
  }))
  const [which, setWhich] = useState<Which>('header')
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)

  const options: Option[] = [
    { key: 'catalog', label: 'All products', description: 'The catalog', target: { kind: 'catalog' } },
    ...s.pages
      .filter((p) => isMenuPage(p))
      .map((p) => ({
        key: `page:${p.id}`,
        label: p.title,
        description:
          p.status === 'published'
            ? `Page · ${p.kind === 'home' ? '/' : p.slug}`
            : `Page · ${PAGE_STATUS_LABEL[p.status]}, hidden until it is published`,
        target: { kind: 'page' as const, id: p.id },
      })),
    ...s.categories.map((c) => ({
      key: `category:${c.id}`,
      label: c.name,
      description: 'Category',
      target: { kind: 'category' as const, id: c.id },
    })),
    ...s.collections.map((c) => ({
      key: `collection:${c.id}`,
      label: c.name,
      description: 'Collection',
      target: { kind: 'collection' as const, id: c.id },
    })),
    {
      key: 'url',
      label: 'A link',
      description: 'A full https address or a store path',
      target: { kind: 'url', url: '' },
    },
  ]

  const list = rows[which]
  const setList = (fn: (list: Row[]) => Row[]) => setRows((r) => ({ ...r, [which]: fn(r[which]) }))
  const update = (key: number, patch: Partial<MenuLink>) =>
    setList((l) => l.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  const move = (row: Row, to: number) =>
    setList((l) => {
      const from = l.indexOf(row)
      const target = Math.max(0, Math.min(l.length - 1, to))
      if (from < 0 || from === target) return l
      const out = [...l]
      out.splice(target, 0, ...out.splice(from, 1))
      return out
    })
  const add = () => {
    const first = options[0]!
    setList((l) => [...l, { key: next.current++, label: first.label, target: first.target }])
  }
  const reorder = usePointerReorder({ items: list, keyOf: (r) => String(r.key), onMove: move })

  const menus = cleanMenus({ header: rows.header, footer: rows.footer })
  const blocker = menusBlocker(menus)
  const save = async () => {
    setTried(true)
    if (blocker) return
    setSaving(true)
    try {
      await s.dispatchAsync({ type: 'menus/save', tenantId: s.tenantId, menus })
      const empty = !menus.header.length && !menus.footer.length
      toast('Menus saved', {
        tone: 'success',
        description: empty
          ? 'The store shows its theme links again.'
          : `${menus.header.length} header and ${menus.footer.length} footer links are live.`,
      })
      onClose()
    } catch (err) {
      toast('The menus were not saved', {
        tone: 'danger',
        description: err instanceof Error ? err.message : 'The server did not answer. Try again.',
      })
    } finally {
      setSaving(false)
    }
  }
  const dropLine = <li aria-hidden="true" className="h-0.5 mx-2 rounded-full bg-accent" />

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Menus</DialogTitle>
          <DialogDescription>
            The links in your store's header and footer. They go live when you save. A menu with no links
            shows the theme's own, and unpublished pages stay hidden until they go live.
          </DialogDescription>
        </DialogHeader>

        <PillTabs
          size="sm"
          value={which}
          onValueChange={(v) => setWhich(v === 'footer' ? 'footer' : 'header')}
          items={[
            { value: 'header', label: `Header (${rows.header.length})` },
            { value: 'footer', label: `Footer (${rows.footer.length})` },
          ]}
        />

        {list.length ? (
          <ol className="space-y-2" aria-label={`${which === 'header' ? 'Header' : 'Footer'} links`}>
            {list.map((row, i) => {
              const option = options.find((o) => o.key === targetKey(row.target))
              const url = row.target.kind === 'url' ? row.target.url : null
              const badUrl = url !== null && tried && !validLink(url.trim())
              return (
                <Fragment key={row.key}>
                  {reorder.dropBefore(row) && dropLine}
                  <li
                    ref={reorder.rowRef(row)}
                    className={cn(
                      'gap-2 p-2 rounded-2xl grid grid-cols-[auto_minmax(0,1fr)_auto] items-start bg-surface',
                      reorder.dragging === String(row.key) && 'opacity-60 ring-2 ring-accent',
                    )}
                  >
                    <Tooltip content="Drag, or use the arrow keys, to move">
                      <button
                        type="button"
                        aria-label={`Move ${row.label || 'link'}`}
                        {...reorder.handle(row, i)}
                        className="h-10 w-6 rounded-lg flex cursor-grab touch-none items-center justify-center text-muted hover:text-foreground"
                      >
                        <GripVertical className="size-4" aria-hidden="true" />
                      </button>
                    </Tooltip>
                    <div className="min-w-0 gap-2 sm:grid-cols-2 grid grid-cols-1">
                      <Input
                        aria-label="Link label"
                        value={row.label}
                        maxLength={MENU_LABEL_MAX}
                        invalid={tried && !row.label.trim()}
                        onChange={(e) => update(row.key, { label: e.target.value })}
                      />
                      <Combobox
                        aria-label={`Where ${row.label || 'the link'} goes`}
                        items={options}
                        value={option?.key ?? null}
                        onChange={(key) => {
                          const picked = options.find((o) => o.key === key)
                          if (!picked) return
                          // A fresh pick names the link after its target, unless the owner renamed it.
                          const named = !row.label.trim() || row.label === option?.label
                          update(row.key, {
                            target: picked.target,
                            ...(named && picked.key !== 'url' && { label: picked.label }),
                          })
                        }}
                        getKey={(o) => o.key}
                        getLabel={(o) => o.label}
                        getDescription={(o) => o.description}
                        searchPlaceholder="Search pages, categories and collections"
                        invalid={tried && !option}
                      />
                      {url !== null && (
                        <Input
                          aria-label={`Address for ${row.label || 'the link'}`}
                          className="sm:col-span-2"
                          placeholder="https://… or /about"
                          inputMode="url"
                          value={url}
                          invalid={badUrl}
                          onChange={(e) => update(row.key, { target: { kind: 'url', url: e.target.value } })}
                        />
                      )}
                      {badUrl && (
                        <p className="text-xs font-medium sm:col-span-2 text-danger">
                          Enter a full https address, or a store path that starts with /.
                        </p>
                      )}
                    </div>
                    <div className="flex items-center">
                      <RowAction
                        icon={ArrowUp}
                        label={`Move ${row.label || 'link'} up`}
                        reason={i === 0 ? 'Already at the top' : null}
                        onClick={() => move(row, i - 1)}
                      />
                      <RowAction
                        icon={ArrowDown}
                        label={`Move ${row.label || 'link'} down`}
                        reason={i === list.length - 1 ? 'Already at the bottom' : null}
                        onClick={() => move(row, i + 1)}
                      />
                      <RowAction
                        icon={Trash2}
                        label={`Remove ${row.label || 'link'}`}
                        reason={null}
                        onClick={() => setList((l) => l.filter((r) => r.key !== row.key))}
                      />
                    </div>
                  </li>
                </Fragment>
              )
            })}
            {reorder.dropAtEnd && dropLine}
          </ol>
        ) : (
          <p className="p-4 text-sm rounded-2xl bg-surface text-muted">
            No links yet, so the store shows the theme's {which} links.
          </p>
        )}

        <Button
          variant="soft"
          size="sm"
          onClick={add}
          disabled={list.length >= LIMIT[which]}
          className="self-start"
        >
          <Plus />
          Add a link
        </Button>
        {list.length >= LIMIT[which] && (
          <p className="text-xs text-muted">
            The {which} holds up to {LIMIT[which]} links.
          </p>
        )}
        {tried && blocker && (
          <p role="alert" className="text-sm font-medium text-danger">
            {blocker}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save menus'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
