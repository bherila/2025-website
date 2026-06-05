import { ClipboardList, FileSpreadsheet, Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { YearSelectorWithNav } from '../YearSelectorWithNav'
import { useDockActions } from './DockActions'

interface DockHeaderBarProps {
  selectedYear: number
  availableYears: number[]
  isLoadingYears: boolean
  pendingReviewCount: number
  onYearChange: (year: number | 'all') => void
}

/**
 * Top header bar for the Tax Preview dock. Holds the title, command palette,
 * document review queue, workbook export, and year navigation.
 *
 * Must be rendered inside `<DockActionsProvider>` so `useDockActions` resolves.
 */
export function DockHeaderBar({
  selectedYear,
  availableYears,
  isLoadingYears,
  pendingReviewCount,
  onYearChange,
}: DockHeaderBarProps): React.ReactElement {
  const { exportXlsx, isExportingXlsx, openReviewQueue, setPaletteOpen } = useDockActions()
  const meta = navigatorMeta()

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2">
      <h1 className="text-base font-semibold tracking-tight">Tax Preview</h1>
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Open command palette"
      >
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Jump to form…</span>
        <kbd className="ml-1 hidden rounded border border-border bg-muted px-1 font-mono text-[10px] sm:inline">
          {meta}K
        </kbd>
      </button>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {pendingReviewCount > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            onClick={openReviewQueue}
          >
            <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
            Review Documents
            <Badge variant="destructive" className="h-4 px-1.5 py-0 text-xs">
              {pendingReviewCount}
            </Badge>
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-xs"
          onClick={() => {
            void exportXlsx()
          }}
          disabled={isExportingXlsx}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
          {isExportingXlsx ? 'Generating...' : 'Export XLSX'}
        </Button>
        <YearSelectorWithNav
          selectedYear={selectedYear}
          availableYears={availableYears}
          isLoading={isLoadingYears}
          onYearChange={onYearChange}
          includeAll={false}
        />
      </div>
    </div>
  )
}

function navigatorMeta(): string {
  if (typeof navigator === 'undefined') {
    return '⌘'
  }
  return /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘' : 'Ctrl '
}
