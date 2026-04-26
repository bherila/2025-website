import { Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

import { useDockActions } from './DockActions'

/**
 * Top header bar shown when dock mode is active. Holds the title, the
 * "Dock preview" badge, the ⌘K palette trigger, and the disable hint.
 *
 * Must be rendered inside `<DockActionsProvider>` so `useDockActions` resolves.
 */
export function DockHeaderBar(): React.ReactElement {
  const { setPaletteOpen } = useDockActions()
  const meta = navigatorMeta()

  return (
    <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2">
      <h1 className="text-base font-semibold tracking-tight">Tax Preview</h1>
      <Badge variant="outline" className="text-xs">
        Dock preview
      </Badge>
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="ml-2 inline-flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Open command palette"
      >
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Jump to form…</span>
        <kbd className="ml-1 hidden rounded border border-border bg-muted px-1 font-mono text-[10px] sm:inline">
          {meta}K
        </kbd>
      </button>
      <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          Append <code className="rounded bg-muted px-1 py-0.5 font-mono">?dock=0</code> to disable
        </span>
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
