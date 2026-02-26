import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Pagination } from './pagination'

export interface Column<T> {
  key: keyof T & string
  header: string
  render?: (value: T[keyof T], row: T) => React.ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  pageSize?: number
  emptyMessage?: string
  loading?: boolean
  pageLabel?: string
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  pageSize = 10,
  emptyMessage = 'No data',
  loading = false,
  pageLabel,
}: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize))

  // Clamp page if data shrinks (e.g., inspector slider changes)
  const safePage = Math.min(currentPage, totalPages)
  if (safePage !== currentPage) {
    setCurrentPage(safePage)
  }

  const startIdx = (safePage - 1) * pageSize
  const pageData = data.slice(startIdx, startIdx + pageSize)

  if (loading) {
    return (
      <div className="overflow-hidden rounded-lg border border-cream-400">
        <table className="w-full">
          <thead>
            <tr className="border-b border-cream-400 bg-cream-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-2.5 text-left text-xs font-semibold text-charcoal-400',
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: pageSize }, (_, i) => (
              <tr key={i} className="border-b border-cream-300 last:border-b-0">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-cream-300" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-cream-400 py-12">
        <span className="text-sm text-slate-500">{emptyMessage}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-lg border border-cream-400">
        <table className="w-full">
          <thead>
            <tr className="border-b border-cream-400 bg-cream-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-2.5 text-left text-xs font-semibold text-charcoal-400',
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-cream-50">
            {pageData.map((row, rowIdx) => (
              <tr
                key={startIdx + rowIdx}
                className="border-b border-cream-300 last:border-b-0 hover:bg-cream-100"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-sm text-charcoal-500',
                      col.className
                    )}
                  >
                    {col.render
                      ? col.render(row[col.key], row)
                      : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={safePage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        pageLabel={pageLabel}
      />
    </div>
  )
}

export type { Column as DataTableColumn }
