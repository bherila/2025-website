import { Button } from '@/components/ui/button'

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250]

export interface PaginationControlsProps {
  currentPage: number
  totalPages: number
  totalRows: number
  pageSize: number
  viewAll: boolean
  onPageChange: (page: number) => void
  onViewAll: () => void
  onPageSizeChange: (size: number) => void
}

export function PaginationControls({
  currentPage, totalPages, totalRows, pageSize, viewAll,
  onPageChange, onViewAll, onPageSizeChange,
}: PaginationControlsProps) {
  const startRow = totalRows === 0 ? 0 : viewAll ? 1 : (currentPage - 1) * pageSize + 1
  const endRow = viewAll ? totalRows : Math.min(currentPage * pageSize, totalRows)

  return (
    <div className="flex items-center justify-between px-2 py-2 text-xs font-mono text-muted-foreground border-b border-border">
      <span>
        SHOWING {startRow.toLocaleString()}–{endRow.toLocaleString()} OF {totalRows.toLocaleString()} ROWS
      </span>
      <div className="flex items-center gap-2">
        {!viewAll && totalPages > 1 && (
          <>
            <Button variant="outline" size="sm" className="h-7 px-2 font-mono text-[10px]" disabled={currentPage <= 1} onClick={() => onPageChange(1)}>
              ««
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2 font-mono text-[10px]" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
              «
            </Button>
            <span className="px-2 uppercase tracking-wider">
              Page {currentPage} of {totalPages}
            </span>
            <Button variant="outline" size="sm" className="h-7 px-2 font-mono text-[10px]" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>
              »
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2 font-mono text-[10px]" disabled={currentPage >= totalPages} onClick={() => onPageChange(totalPages)}>
              »»
            </Button>
          </>
        )}
        <select
          aria-label="Rows per page"
          className="h-7 px-2 font-mono text-[10px] uppercase tracking-wider bg-background border border-border rounded text-foreground cursor-pointer"
          value={viewAll ? 'all' : pageSize.toString()}
          onChange={(e) => {
            const val = e.target.value
            if (val === 'all') {
              onViewAll()
            } else {
              onPageSizeChange(Number(val))
            }
          }}
        >
          {PAGE_SIZE_OPTIONS.map((opt) => (
            <option key={opt} value={opt.toString()}>
              {opt} / page
            </option>
          ))}
          <option value="all">Show all</option>
        </select>
      </div>
    </div>
  )
}
