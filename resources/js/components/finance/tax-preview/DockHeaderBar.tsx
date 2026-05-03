import { AlertCircle, FileSpreadsheet, Search } from 'lucide-react'

import { YearSelectorWithNav } from '@/components/finance/YearSelectorWithNav'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { YearSelection } from '@/lib/financeRouteBuilder'

import { useDockActions } from './DockActions'

interface DockHeaderBarProps {
  year: number
  availableYears: number[]
  isLoading: boolean
  onYearChange: (year: YearSelection) => void
  pendingReviewCount: number
}

/**
 * Top header bar shown when dock mode is active. Holds the title, the
 * title, year selector, command palette trigger, dock actions, and the
 * review queue shortcut.
 *
 * Must be rendered inside `<DockActionsProvider>` so `useDockActions` resolves.
 */
export function DockHeaderBar({
  year,
  availableYears,
  isLoading,
  onYearChange,
  pendingReviewCount,
}: DockHeaderBarProps): React.ReactElement {
  const { exportXlsx, isExportingXlsx, openReviewQueue, setPaletteOpen } = useDockActions()
  const meta = navigatorMeta()
  const reviewLabel = pendingReviewCount > 0 ? `Review Queue (${pendingReviewCount})` : 'Review Queue'

  return (
    <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2">
      <h1 className="text-base font-semibold tracking-tight">Tax Preview</h1>
      <Badge variant="outline" className="text-xs">
        Dock
      </Badge>
      <YearSelectorWithNav
        selectedYear={year}
        availableYears={availableYears}
        isLoading={isLoading}
        onYearChange={onYearChange}
        includeAll={false}
        className="ml-2"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="ml-2 h-7 gap-1.5 px-2.5 text-xs"
        onClick={() => setPaletteOpen(true)}
        aria-label="Open command palette"
      >
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Jump</span>
        <kbd className="ml-1 hidden rounded border border-border bg-muted px-1 font-mono text-[10px] sm:inline">
          {meta}K
        </kbd>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 px-2.5 text-xs"
        onClick={openReviewQueue}
      >
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        {reviewLabel}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="ml-auto h-7 gap-1.5 px-2.5 text-xs"
        onClick={exportXlsx}
        disabled={isExportingXlsx}
      >
        <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
        {isExportingXlsx ? 'Generating…' : 'Export XLSX'}
      </Button>
    </div>
  )
}

function navigatorMeta(): string {
  if (typeof navigator === 'undefined') {
    return '⌘'
  }
  return /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘' : 'Ctrl '
}
