import { Card, CardContent, CardDescription, CardTitle, SegmentedControl, cn } from '@rc/ui'
import type { ReactNode } from 'react'
import { useHistoryState } from '../../lib/history-state'

export interface ChartTable {
  columns: [string, string]
  rows: [string, string][]
}

const VIEWS = [
  { value: 'chart', label: 'Chart' },
  { value: 'table', label: 'Table' },
]

/** One chart per card: the title names measure and grain, the method line says how it is counted. */
export function ChartCard({
  title,
  method,
  table,
  action,
  footnote,
  className,
  children,
}: {
  title: string
  method: ReactNode
  /** The same numbers as rows, behind a Chart / Table toggle. */
  table?: ChartTable
  action?: ReactNode
  footnote?: ReactNode
  className?: string
  children: ReactNode
}) {
  const [view, setView] = useHistoryState<'chart' | 'table'>(`view:${title}`, 'chart')
  const showTable = table !== undefined && view === 'table'
  return (
    <Card className={cn('min-w-0 flex flex-col', className)}>
      <div className="gap-2 p-5 flex flex-wrap items-start justify-between">
        <div className="basis-0 gap-1 flex min-w-[min(100%,16rem)] flex-1 flex-col">
          <CardTitle>{title}</CardTitle>
          <CardDescription className="text-xs">{method}</CardDescription>
        </div>
        {(action !== undefined || table !== undefined) && (
          <div className="gap-2 flex max-w-full flex-wrap items-center">
            {action}
            {table !== undefined && (
              <SegmentedControl
                size="sm"
                aria-label={`${title}: chart or table`}
                value={view}
                onChange={(next) => setView(next === 'table' ? 'table' : 'chart')}
                options={VIEWS}
              />
            )}
          </div>
        )}
      </div>
      <CardContent className="flex-1">
        {showTable ? <TableView title={title} table={table} /> : children}
        {footnote !== undefined && !showTable && <p className="mt-3 text-xs text-muted">{footnote}</p>}
      </CardContent>
    </Card>
  )
}

function TableView({ title, table }: { title: string; table: ChartTable }) {
  if (!table.rows.length) return <p className="py-8 text-sm text-center text-muted">No data</p>
  return (
    <div className="max-h-80 overflow-y-auto">
      <table className="text-sm w-full">
        <caption className="sr-only">{title}</caption>
        <thead className="top-0 sticky bg-card">
          <tr className="border-b border-border">
            <th
              scope="col"
              className="h-9 pr-2 text-xs font-semibold tracking-wide text-left text-muted uppercase"
            >
              {table.columns[0]}
            </th>
            <th
              scope="col"
              className="h-9 pl-2 text-xs font-semibold tracking-wide text-right text-muted uppercase"
            >
              {table.columns[1]}
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map(([label, value]) => (
            <tr key={label} className="border-b border-border last:border-b-0">
              <td className="py-2 pr-2">{label}</td>
              <td className="py-2 pl-2 text-right whitespace-nowrap tabular-nums">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
