import { cn } from '@/lib/utils'

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  pageLabel?: string
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  pageLabel = 'Page',
}: PaginationProps) {
  if (totalPages <= 1) return null

  const pages = getPageNumbers(currentPage, totalPages)

  return (
    <div className="flex items-center justify-between px-1 py-2">
      <span className="text-xs text-slate-500">
        {pageLabel} {currentPage} / {totalPages}
      </span>

      <div className="flex items-center gap-1">
        {/* Previous */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="flex size-8 items-center justify-center rounded-md text-sm text-charcoal-400 hover:bg-cream-200 disabled:opacity-40"
          aria-label="Previous page"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>

        {/* Page numbers */}
        {pages.map((page, i) =>
          page === '...' ? (
            <span key={`ellipsis-${i}`} className="flex size-8 items-center justify-center text-xs text-slate-400">
              ...
            </span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page as number)}
              className={cn(
                'flex size-8 items-center justify-center rounded-md text-xs font-medium transition-colors',
                page === currentPage
                  ? 'bg-teal-500 text-white'
                  : 'text-charcoal-400 hover:bg-cream-200'
              )}
            >
              {page}
            </button>
          )
        )}

        {/* Next */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="flex size-8 items-center justify-center rounded-md text-sm text-charcoal-400 hover:bg-cream-200 disabled:opacity-40"
          aria-label="Next page"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>
    </div>
  )
}

/**
 * Generate page numbers with ellipsis for large page counts.
 * Always shows first, last, and 1 page on each side of current.
 * Example: [1, '...', 4, 5, 6, '...', 10]
 */
function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: (number | '...')[] = [1]

  if (current > 3) {
    pages.push('...')
  }

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  if (current < total - 2) {
    pages.push('...')
  }

  pages.push(total)

  return pages
}
