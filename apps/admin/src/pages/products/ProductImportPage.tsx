import type { CsvDelimiterName, ProductImport, ProductImportIssue } from '@rc/api'
import { type CsvDelimiter, detectDelimiter, fmtNumber, parseCsv, plural } from '@rc/fixtures'
import {
  Banner,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Combobox,
  PageHeader,
  ProgressBar,
  StatCard,
  toast,
} from '@rc/ui'
import { CircleCheck, CirclePlus, FileSpreadsheet, PenLine, TriangleAlert } from 'lucide-react'
import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { apiMessage } from '../../components/AuditHistory'
import { BackButton } from '../../components/BackButton'
import { HTTP, api } from '../../lib/api'
import { saveBlob } from '../../lib/download'
import { useScoped } from '../../state/scoped'

/** The server's limits, said up front. */
const MAX_BYTES = 5 * 1024 * 1024
const MAX_ROWS = 5000

const BASE_FIELDS = [
  { id: 'handle', label: 'Handle (product code)', required: true },
  { id: 'sku', label: 'Variant SKU', required: true },
  { id: 'name', label: 'Name' },
  { id: 'description', label: 'Description' },
  { id: 'category', label: 'Category name' },
  { id: 'status', label: 'Status (draft, active, archived)' },
  { id: 'price', label: 'Price (rupiah)' },
  { id: 'compare_at_price', label: 'Compare-at price' },
  { id: 'weight_grams', label: 'Weight (grams)' },
  { id: 'image_url', label: 'Image URL' },
  { id: 'barcode', label: 'Barcode' },
  ...[1, 2, 3].flatMap((n) => [
    { id: `option${n}_name`, label: `Option ${n} name` },
    { id: `option${n}_value`, label: `Option ${n} value` },
  ]),
]

/** Other headings people use for a field. */
const ALIASES: Record<string, string> = {
  code: 'handle',
  'product code': 'handle',
  title: 'name',
  'product name': 'name',
  'variant sku': 'sku',
  'variant price': 'price',
  'compare at price': 'compare_at_price',
  weight: 'weight_grams',
  image: 'image_url',
}

const IGNORE = ''

function guessField(header: string, known: Set<string>) {
  const h = header.trim().toLowerCase()
  if (h.startsWith('stock:')) {
    const field = `stock:${h.slice(6).trim().toUpperCase()}`
    return known.has(field) ? field : IGNORE
  }
  if (known.has(h)) return h
  return ALIASES[h] ?? IGNORE
}

interface Picked {
  name: string
  text: string
  delimiter: CsvDelimiter
  headers: string[]
  rows: number
}

/** Upload a product CSV, map its columns, check every row, then apply in batches. */
export function ProductImportPage() {
  const { can } = useAuth()
  const s = useScoped()
  const [params, setParams] = useSearchParams()
  const [picked, setPicked] = useState<Picked | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [plan, setPlan] = useState<ProductImport | null>(null)
  const [busy, setBusy] = useState<'check' | 'apply' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fields = useMemo(
    () => [
      ...BASE_FIELDS,
      ...s.warehouses.map((w) => ({ id: `stock:${w.code.toUpperCase()}`, label: `Stock at ${w.name}` })),
    ],
    [s.warehouses],
  )

  // An import left midway carries on from the server's copy.
  const resumeId = params.get('import')
  useEffect(() => {
    if (!HTTP || !resumeId || plan) return
    api.productCsv
      .get(resumeId)
      .then(setPlan)
      .catch((err: unknown) => setError(apiMessage(err)))
  }, [resumeId, plan])

  const setImport = (id: string | null) =>
    setParams(
      (p) => {
        if (id) p.set('import', id)
        else p.delete('import')
        return p
      },
      { replace: true },
    )

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    setError(null)
    setPlan(null)
    setImport(null)
    if (!file) return
    if (file.size > MAX_BYTES) {
      setPicked(null)
      setError(`${file.name} is over 5 MB. Split it and import each part.`)
      return
    }
    const text = await file.text()
    const delimiter = detectDelimiter(text)
    const all = parseCsv(text, delimiter)
    const headers = (all[0] ?? []).map((h) => h.trim())
    if (headers.length === 0) {
      setPicked(null)
      setError(`${file.name} has no header row.`)
      return
    }
    const known = new Set(fields.map((f) => f.id))
    const used = new Set<string>()
    const next: Record<string, string> = {}
    for (const h of headers) {
      const f = guessField(h, known)
      next[h] = f && !used.has(f) ? f : IGNORE
      if (f) used.add(f)
    }
    setMapping(next)
    setPicked({ name: file.name, text, delimiter, headers, rows: Math.max(0, all.length - 1) })
  }

  const mapped = new Set(Object.values(mapping).filter(Boolean))
  const missing = BASE_FIELDS.filter((f) => f.required && !mapped.has(f.id)).map((f) => f.id)
  const tooMany = (picked?.rows ?? 0) > MAX_ROWS

  const check = async () => {
    if (!picked) return
    setBusy('check')
    setError(null)
    try {
      const out = await api.productCsv.plan({
        tenantId: s.tenantId,
        fileName: picked.name,
        csv: picked.text,
        delimiter: picked.delimiter,
        mapping,
      })
      setPlan(out)
      setImport(out.id)
    } catch (err) {
      setError(apiMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const apply = async () => {
    if (!plan) return
    setBusy('apply')
    setError(null)
    let current = plan
    try {
      while (current.status !== 'done') {
        current = await api.productCsv.apply(current.id)
        setPlan(current)
      }
      toast('Products imported', {
        tone: 'success',
        description: `${plural(current.created, 'product')} created, ${fmtNumber(current.updated)} updated`,
      })
    } catch (err) {
      setError(`${apiMessage(err)} The products applied so far are saved; resume to carry on.`)
    } finally {
      setBusy(null)
    }
  }

  const template = async (delimiter: CsvDelimiterName) => {
    try {
      saveBlob(await api.productCsv.template(delimiter), 'product-import-template.csv')
    } catch (err) {
      toast('The template did not download', { tone: 'danger', description: apiMessage(err) })
    }
  }

  if (!HTTP || !can('product.manage')) {
    return (
      <>
        <PageHeader title="Import products" description="Create and update products from a CSV file." />
        <Banner tone="warning" title={HTTP ? 'Ask someone who manages products' : 'This console runs without the API'}>
          {HTTP
            ? 'Only people who manage products import them.'
            : 'Imports run on the server. Build the console with VITE_API_URL to use them.'}
        </Banner>
      </>
    )
  }

  const started = plan && (plan.next > 0 || plan.status !== 'ready')
  return (
    <>
      <div className="mb-4">
        <BackButton fallback="/commerce/products" />
      </div>
      <PageHeader
        title="Import products"
        description="Create and update products from a CSV file, one row per variant. Rows match by handle and SKU; products missing from the file stay as they are."
      />
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>1. Choose a file</CardTitle>
            <CardDescription>
              CSV in UTF-8, comma or semicolon, at most 5 MB and {fmtNumber(MAX_ROWS)} rows. Blank cells keep what
              a product has. Stock columns set the on-hand count per warehouse.
            </CardDescription>
          </CardHeader>
          <div className="gap-2 px-5 pb-5 flex flex-wrap items-center justify-between">
            <label className="gap-2 flex min-w-0 items-center">
              <span className="sr-only">CSV file</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => void pick(e)}
                className="text-sm min-w-0 max-w-full file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
              />
            </label>
            <div className="gap-2 flex flex-wrap">
              <Button variant="outline" size="sm" onClick={() => void template('comma')}>
                <FileSpreadsheet />
                Template (comma)
              </Button>
              <Button variant="outline" size="sm" onClick={() => void template('semicolon')}>
                <FileSpreadsheet />
                Template (semicolon)
              </Button>
            </div>
          </div>
          {picked && (
            <p className="px-5 pb-5 text-sm text-muted break-words">
              {picked.name}: {plural(picked.rows, 'row')}, {picked.delimiter === ';' ? 'semicolon' : 'comma'} separated.
            </p>
          )}
        </Card>

        {error && (
          <Banner tone="danger" title="The import stopped">
            {error}
          </Banner>
        )}

        {picked && !plan && (
          <Card>
            <CardHeader>
              <CardTitle>2. Match the columns</CardTitle>
              <CardDescription>
                Pick the field each column fills. Handle and SKU are required; columns set to Ignore are skipped.
              </CardDescription>
            </CardHeader>
            <ul className="px-5 pb-4 gap-2 grid grid-cols-1">
              {picked.headers.map((h) => (
                <li
                  key={h}
                  className="gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] grid grid-cols-1 items-center"
                >
                  <span className="text-sm font-medium font-mono break-all">{h}</span>
                  <Combobox
                    aria-label={`Field for ${h}`}
                    items={[{ id: IGNORE, label: 'Ignore this column' }, ...fields]}
                    getKey={(f) => f.id || 'ignore'}
                    getLabel={(f) => f.label}
                    getDisabledReason={(f) =>
                      f.id && mapped.has(f.id) && mapping[h] !== f.id ? 'Another column fills it' : null
                    }
                    value={mapping[h] || 'ignore'}
                    onChange={(v) => setMapping((m) => ({ ...m, [h]: v && v !== 'ignore' ? v : IGNORE }))}
                  />
                </li>
              ))}
            </ul>
            <div className="gap-2 px-5 pb-5 flex flex-wrap items-center justify-between">
              <p className="text-sm text-muted">
                {missing.length
                  ? `Match a column to ${missing.join(' and ')}.`
                  : tooMany
                    ? `The file has more than ${fmtNumber(MAX_ROWS)} rows. Split it.`
                    : 'Nothing changes until you apply.'}
              </p>
              <Button disabled={missing.length > 0 || tooMany} loading={busy === 'check'} onClick={() => void check()}>
                Check {plural(picked.rows, 'row')}
              </Button>
            </div>
          </Card>
        )}

        {plan && (
          <Card>
            <CardHeader>
              <CardTitle>{plan.status === 'done' ? 'Import finished' : started ? '3. Applying' : '3. Review'}</CardTitle>
              <CardDescription>
                {plan.fileName || 'The file'}: {plural(plan.rows, 'row')}. Products apply 100 to a transaction, through
                the same saves as the product page, and each change lands in the audit log.
              </CardDescription>
            </CardHeader>
            <div className="gap-3 px-5 pb-4 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
              {plan.status === 'ready' && plan.next === 0 ? (
                <>
                  <StatCard label="To create" value={plan.plan.create} icon={<CirclePlus />} tone="ink" />
                  <StatCard label="To update" value={plan.plan.update} icon={<PenLine />} />
                  <StatCard label="Unchanged" value={plan.plan.unchanged} icon={<CircleCheck />} />
                  <StatCard
                    label="Refused"
                    value={plan.plan.invalid}
                    icon={<TriangleAlert />}
                    tone={plan.plan.invalid ? 'danger' : 'success'}
                  />
                </>
              ) : (
                <>
                  <StatCard label="Created" value={plan.created} icon={<CirclePlus />} tone="ink" />
                  <StatCard label="Updated" value={plan.updated} icon={<PenLine />} />
                  <StatCard label="Unchanged" value={plan.unchanged} icon={<CircleCheck />} />
                  <StatCard
                    label="Skipped"
                    value={plan.skipped + plan.plan.invalid}
                    icon={<TriangleAlert />}
                    tone={plan.skipped + plan.plan.invalid ? 'danger' : 'success'}
                  />
                </>
              )}
            </div>
            {plan.total > 0 && (
              <div className="px-5 pb-4 space-y-1">
                <ProgressBar value={plan.next / plan.total} aria-label="Import progress" />
                <p className="text-xs text-muted">
                  {fmtNumber(plan.next)} of {plural(plan.total, 'product')} applied
                </p>
              </div>
            )}
            {plan.status !== 'done' && (
              <div className="gap-2 px-5 pb-5 flex flex-wrap items-center justify-between">
                <p className="text-sm text-muted">
                  {plan.total === 0 ? 'No row passed the check. Fix the file and choose it again.' : 'Refused rows stay out.'}
                </p>
                <Button disabled={plan.total === 0} loading={busy === 'apply'} onClick={() => void apply()}>
                  {started ? 'Resume' : `Apply ${plural(plan.total, 'product')}`}
                </Button>
              </div>
            )}
            {plan.issues.length > 0 && <Issues issues={plan.issues} />}
          </Card>
        )}
      </div>
    </>
  )
}

const ISSUES_SHOWN = 200
const cell = 'px-5 py-2 border-b border-border text-left align-top'

function Issues({ issues }: { issues: ProductImportIssue[] }) {
  return (
    <div className="pb-4">
      <p className="px-5 pb-2 text-sm font-medium">
        {plural(issues.length, 'problem')}
        {issues.length > ISSUES_SHOWN && `, the first ${ISSUES_SHOWN} shown`}
      </p>
      <div className="overflow-x-auto">
        <table className="text-sm w-full">
          <thead className="text-xs text-muted">
            <tr>
              <th className={cell}>Line</th>
              <th className={cell}>Handle / SKU</th>
              <th className={cell}>Column</th>
              <th className={cell}>Problem</th>
            </tr>
          </thead>
          <tbody>
            {issues.slice(0, ISSUES_SHOWN).map((i, n) => (
              <tr key={n}>
                <td className={`${cell} tabular-nums`}>{i.line || 'File'}</td>
                <td className={`${cell} font-mono text-xs whitespace-nowrap`}>
                  {[i.handle, i.sku].filter(Boolean).join(' / ')}
                </td>
                <td className={`${cell} font-mono text-xs`}>{i.column}</td>
                <td className={`${cell} min-w-56`}>{i.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
