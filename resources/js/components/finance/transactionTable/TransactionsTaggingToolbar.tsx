import { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { TagSelect } from '../rules_engine/TagSelect'
import type { FinanceTag } from '../useFinanceTags'

interface TransactionsTaggingToolbarProps {
  effectiveCount: number
  isSelection: boolean
  onApplyTag: (tagId: number) => Promise<void>
  onRemoveTag: (tagId: number) => Promise<void>
  onRemoveAllTags: () => Promise<void>
  availableTags: FinanceTag[]
  isLoadingTags: boolean
  onClearSelection: () => void
  /** Optional batch-delete handler; if provided a Delete button is shown */
  onBatchDelete?: () => Promise<void>
  /** Optional export handlers for CSV/JSON */
  onExportCSV?: () => void
  onExportJSON?: () => void
}

export function TransactionsTaggingToolbar({
  effectiveCount, isSelection, onApplyTag, onRemoveTag, onRemoveAllTags,
  availableTags, isLoadingTags, onClearSelection, onBatchDelete,
  onExportCSV, onExportJSON,
}: TransactionsTaggingToolbarProps) {
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [removeTagsConfirmOpen, setRemoveTagsConfirmOpen] = useState(false)
  const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false)
  const [pendingTagAction, setPendingTagAction] = useState<'add' | 'remove' | 'clear' | null>(null)

  const isTagActionPending = pendingTagAction !== null

  const handleApplySelectedTag = async () => {
    if (!selectedTagId || isTagActionPending) return

    setPendingTagAction('add')
    try {
      await onApplyTag(Number(selectedTagId))
    } finally {
      setPendingTagAction(null)
    }
  }

  const handleRemoveSelectedTag = async () => {
    if (!selectedTagId || isTagActionPending) return

    setPendingTagAction('remove')
    try {
      await onRemoveTag(Number(selectedTagId))
    } finally {
      setPendingTagAction(null)
    }
  }

  const handleRemoveAllTags = async () => {
    if (isTagActionPending) return

    setRemoveTagsConfirmOpen(false)
    setPendingTagAction('clear')
    try {
      await onRemoveAllTags()
    } finally {
      setPendingTagAction(null)
    }
  }

  if (effectiveCount > 1000) {
    return (
      <div className="border-b border-border bg-card px-3 py-2">
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
          <AlertDescription className="font-mono text-xs">
            Too many items for batch actions ({effectiveCount.toLocaleString()} transactions). Refine view to &lt; 1,000 items.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const label = isSelection
    ? `Action on ${effectiveCount} selected row${effectiveCount !== 1 ? 's' : ''}`
    : `Action on all ${effectiveCount} matching row${effectiveCount !== 1 ? 's' : ''}`

  return (
    <>
      <div className="border-b border-border bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-mono tracking-wide uppercase text-muted-foreground">
            {label}:
          </span>
          {isSelection && (
            <Button variant="ghost" size="sm" className="h-7 font-mono text-[10px] uppercase tracking-wider text-muted-foreground" onClick={onClearSelection}>
              ✕ Clear
            </Button>
          )}
          {isLoadingTags ? (
            <Spinner size="small" />
          ) : (
            <>
              <TagSelect value={selectedTagId} onChange={setSelectedTagId} tags={availableTags} placeholder="Select a tag…" className="w-48 text-xs font-mono" />
              <Button size="sm" className="h-8 font-mono text-[10px] uppercase tracking-wider" disabled={effectiveCount === 0 || !selectedTagId || isTagActionPending} onClick={handleApplySelectedTag}>
                {pendingTagAction === 'add' && <Spinner size="small" className="mr-2 h-3 w-3" />}
                {pendingTagAction === 'add' ? 'Adding' : 'Add'}
              </Button>
              <Button variant="outline" size="sm" className="h-8 font-mono text-[10px] uppercase tracking-wider" disabled={effectiveCount === 0 || !selectedTagId || isTagActionPending} onClick={handleRemoveSelectedTag}>
                {pendingTagAction === 'remove' && <Spinner size="small" className="mr-2 h-3 w-3" />}
                {pendingTagAction === 'remove' ? 'Removing' : 'Remove'}
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="destructive" size="sm" className="h-8 font-mono text-[10px] uppercase tracking-wider ml-2" disabled={effectiveCount === 0 || isTagActionPending} onClick={() => setRemoveTagsConfirmOpen(true)}>
                    {pendingTagAction === 'clear' && <Spinner size="small" className="mr-2 h-3 w-3" />}
                    {pendingTagAction === 'clear' ? 'Clearing' : 'Clear All'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove all tags from {isSelection ? 'selected' : 'transactions in the current view'}</TooltipContent>
              </Tooltip>
              <div className="ml-auto flex items-center gap-3">
                {(onExportCSV || onExportJSON) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 font-mono text-[10px] uppercase tracking-wider" disabled={effectiveCount === 0}>
                        Export ▾
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-card border-border">
                      {onExportCSV && (
                        <DropdownMenuItem onClick={onExportCSV} className="font-mono text-xs cursor-pointer hover:bg-muted">
                          📄 Export as CSV
                        </DropdownMenuItem>
                      )}
                      {onExportJSON && (
                        <DropdownMenuItem onClick={onExportJSON} className="font-mono text-xs cursor-pointer hover:bg-muted">
                          📋 Export as JSON
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {onBatchDelete && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="destructive" size="sm" className="h-8 font-mono text-[10px] uppercase tracking-wider" disabled={effectiveCount === 0} onClick={() => setBatchDeleteConfirmOpen(true)}>
                        Delete ({effectiveCount.toLocaleString()})
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Permanently delete {isSelection ? 'selected' : 'transactions in the current view'}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <AlertDialog open={removeTagsConfirmOpen} onOpenChange={setRemoveTagsConfirmOpen}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-accent">Remove all tags</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will remove all tags from {isSelection ? `the ${effectiveCount} selected transaction${effectiveCount !== 1 ? 's' : ''}` : `all transactions in the current view (${effectiveCount.toLocaleString()})`}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border hover:bg-muted/50">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={isTagActionPending} onClick={handleRemoveAllTags}>
              Confirm Removal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {onBatchDelete && (
        <AlertDialog open={batchDeleteConfirmOpen} onOpenChange={setBatchDeleteConfirmOpen}>
          <AlertDialogContent className="border-border bg-card">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-mono text-accent">Delete transactions</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                This will permanently delete {isSelection ? `the ${effectiveCount} selected transaction${effectiveCount !== 1 ? 's' : ''}` : `all transactions in the current view (${effectiveCount.toLocaleString()})`}. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-border hover:bg-muted/50">Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { setBatchDeleteConfirmOpen(false); await onBatchDelete() }}>
                Confirm Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
