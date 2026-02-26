import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'

export interface DataListProps<T> {
  data: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  keyExtractor: (item: T) => string
  loading?: boolean
  loadingCount?: number
  emptyIcon?: React.ReactNode
  emptyMessage?: string
  emptyDescription?: string
  searchable?: boolean
  searchPlaceholder?: string
  searchFn?: (item: T, query: string) => boolean
  className?: string
}

export function DataList<T>({
  data,
  renderItem,
  keyExtractor,
  loading = false,
  loadingCount = 3,
  emptyIcon,
  emptyMessage = 'No items',
  emptyDescription,
  searchable = false,
  searchPlaceholder = 'Search...',
  searchFn,
  className,
}: DataListProps<T>) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredData = useMemo(() => {
    if (!searchable || !searchQuery.trim() || !searchFn) return data
    return data.filter((item) => searchFn(item, searchQuery))
  }, [data, searchQuery, searchable, searchFn])

  if (loading) {
    return (
      <div className={cn('flex flex-col', className)}>
        {searchable && (
          <div className="px-4 pb-3">
            <div className="h-9 w-full animate-pulse rounded-md bg-cream-300" />
          </div>
        )}
        <div className="flex flex-col divide-y divide-cream-300">
          {Array.from({ length: loadingCount }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="h-10 w-10 animate-pulse rounded-full bg-cream-300" />
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="h-4 w-3/4 animate-pulse rounded bg-cream-300" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-cream-300" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const isEmpty = filteredData.length === 0

  return (
    <div className={cn('flex flex-col', className)}>
      {searchable && (
        <div className="px-4 pb-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-md border border-cream-400 bg-cream-50 px-3 text-sm text-charcoal-500 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
      )}

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-12">
          {emptyIcon && <div className="mb-3 text-slate-400">{emptyIcon}</div>}
          <span className="text-sm font-medium text-slate-500">{emptyMessage}</span>
          {emptyDescription && (
            <span className="mt-1 text-xs text-slate-400">{emptyDescription}</span>
          )}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-cream-300">
          {filteredData.map((item, index) => (
            <div key={keyExtractor(item)}>
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
