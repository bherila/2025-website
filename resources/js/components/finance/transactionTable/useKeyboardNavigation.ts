import type { Virtualizer } from '@tanstack/react-virtual'
import type { KeyboardEvent, MouseEvent } from 'react'
import { useCallback } from 'react'

import type { AccountLineItem } from '@/data/finance/AccountLineItem'

interface UseKeyboardNavigationParams {
  focusedRowIndex: number
  setFocusedRowIndex: (index: number) => void
  displayData: AccountLineItem[]
  selectedRowIds: Set<number>
  handleRowClick: (rowId: number, index: number, e: MouseEvent) => void
  clearSelection: () => void
  selectAll: () => void
  useVirtualScroll: boolean
  virtualizer: Virtualizer<HTMLDivElement, Element>
  onDeleteTransaction?: ((transactionId: string) => Promise<void>) | undefined
  handleBatchDelete: () => Promise<void>
  setSelectedTransaction: (transaction: AccountLineItem) => void
  setDeleteConfirmTransaction: (transaction: AccountLineItem) => void
}

/**
 * Custom hook for keyboard navigation in the transactions table.
 * Handles arrow keys, Ctrl+A, Escape, Enter, and Delete/Backspace.
 */
export function useKeyboardNavigation({
  focusedRowIndex,
  setFocusedRowIndex,
  displayData,
  selectedRowIds,
  handleRowClick,
  clearSelection,
  selectAll,
  useVirtualScroll,
  virtualizer,
  onDeleteTransaction,
  handleBatchDelete,
  setSelectedTransaction,
  setDeleteConfirmTransaction,
}: UseKeyboardNavigationParams) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const totalDisplayedRows = displayData.length
      if (totalDisplayedRows === 0) return

      // Arrow Down: Move focus/selection down
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const newIndex = Math.min(focusedRowIndex + 1, totalDisplayedRows - 1)
        // Guard against no-op movement at boundary
        if (newIndex === focusedRowIndex) return
        setFocusedRowIndex(newIndex)
        const row = displayData[newIndex]
        if (row?.t_id != null) {
          if (e.shiftKey) {
            // Shift+Arrow: extend selection range
            handleRowClick(row.t_id, newIndex, {
              shiftKey: true,
              ctrlKey: false,
              metaKey: false,
            } as MouseEvent)
          } else {
            // Regular arrow: move single selection
            handleRowClick(row.t_id, newIndex, {
              shiftKey: false,
              ctrlKey: false,
              metaKey: false,
            } as MouseEvent)
          }
        }
        // Scroll into view if virtual scrolling
        if (useVirtualScroll) {
          virtualizer.scrollToIndex(newIndex, { align: 'auto' })
        }
      }
      // Arrow Up: Move focus/selection up
      else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const newIndex = Math.max(focusedRowIndex - 1, 0)
        // Guard against no-op movement at boundary
        if (newIndex === focusedRowIndex) return
        setFocusedRowIndex(newIndex)
        const row = displayData[newIndex]
        if (row?.t_id != null) {
          if (e.shiftKey) {
            handleRowClick(row.t_id, newIndex, {
              shiftKey: true,
              ctrlKey: false,
              metaKey: false,
            } as MouseEvent)
          } else {
            handleRowClick(row.t_id, newIndex, {
              shiftKey: false,
              ctrlKey: false,
              metaKey: false,
            } as MouseEvent)
          }
        }
        if (useVirtualScroll) {
          virtualizer.scrollToIndex(newIndex, { align: 'auto' })
        }
      }
      // Ctrl+A / Cmd+A: Select all visible rows
      else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        selectAll()
      }
      // Escape: Clear selection
      else if (e.key === 'Escape') {
        e.preventDefault()
        clearSelection()
        setFocusedRowIndex(-1)
      }
      // Enter: Open transaction details for focused/selected row
      else if (e.key === 'Enter') {
        e.preventDefault()
        let targetRow: AccountLineItem | null = null
        if (selectedRowIds.size === 1) {
          const selectedId = Array.from(selectedRowIds)[0]
          targetRow = displayData.find((r) => r.t_id === selectedId) || null
        } else if (focusedRowIndex >= 0 && focusedRowIndex < displayData.length) {
          targetRow = displayData[focusedRowIndex] || null
        }
        if (targetRow) {
          setSelectedTransaction(targetRow)
        }
      }
      // Delete or Backspace: Trigger delete for selected rows
      else if ((e.key === 'Delete' || e.key === 'Backspace') && onDeleteTransaction) {
        e.preventDefault()
        if (selectedRowIds.size === 1) {
          const selectedId = Array.from(selectedRowIds)[0]
          const targetRow = displayData.find((r) => r.t_id === selectedId)
          if (targetRow) {
            setDeleteConfirmTransaction(targetRow)
          }
        } else if (selectedRowIds.size > 1) {
          // Trigger batch delete
          handleBatchDelete()
        }
      }
    },
    [
      focusedRowIndex,
      displayData,
      selectedRowIds,
      handleRowClick,
      clearSelection,
      selectAll,
      useVirtualScroll,
      virtualizer,
      onDeleteTransaction,
      handleBatchDelete,
      setSelectedTransaction,
      setDeleteConfirmTransaction,
      setFocusedRowIndex,
    ]
  )

  return { handleKeyDown }
}
